/**
 * 极简 ZIP 写入器（store 模式，不压缩）。
 *
 * 为什么手写而不是引依赖：只需要"把几个文本文件打成一个能被任何解压工具打开的包"这一件事，
 * 为它装一个 archiver/jszip 会同时带来锁定文件变动与供应链面积。ZIP 的 store 模式结构固定，
 * 自己写反而更容易审。**没有压缩**是有意的：知识包是文本，体积本来就小，
 * 而"任何工具都能打开"比省那点字节重要。
 *
 * 只实现到够用为止：UTF-8 文件名、无目录条目（解压工具会自动建目录）、无 zip64
 * （>4GB 或 >65535 个条目会抛错，这里不可能碰到）。
 */

export type ZipEntry = {
  /** 包内路径，用 `/` 分隔，例如 `notes/IEEE 754 双精度结构.md`。 */
  name: string;
  content: string;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS 时间：秒精度只有 2 秒，1980 年起算。给不出就填 0，解压工具会显示成默认值。 */
function dosDateTime(date: Date): { time: number; date: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time: time & 0xffff, date: day & 0xffff };
}

export function createZip(entries: ZipEntry[], now = new Date()): Buffer {
  if (entries.length > 0xffff) throw new Error("ZIP 条目过多，超出本实现的范围。");

  const { time, date } = dosDateTime(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.content, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 本地文件头签名
    local.writeUInt16LE(20, 4); // 需要的版本
    local.writeUInt16LE(0x0800, 6); // 文件名按 UTF-8
    local.writeUInt16LE(0, 8); // 压缩方法 0 = store
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // 压缩后大小 = 原始大小
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // 无扩展字段

    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // 中央目录签名
    central.writeUInt16LE(20, 4); // 生成者版本
    central.writeUInt16LE(20, 6); // 需要的版本
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // 扩展
    central.writeUInt16LE(0, 32); // 注释
    central.writeUInt16LE(0, 34); // 起始磁盘
    central.writeUInt16LE(0, 36); // 内部属性
    central.writeUInt32LE(0, 38); // 外部属性
    central.writeUInt32LE(offset, 42); // 本地文件头偏移

    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }

  const centralSize = centrals.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // 中央目录结束签名
  end.writeUInt16LE(0, 4); // 本磁盘编号
  end.writeUInt16LE(0, 6); // 中央目录起始磁盘
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16); // 中央目录偏移
  end.writeUInt16LE(0, 20); // 注释长度

  return Buffer.concat([...locals, ...centrals, end]);
}
