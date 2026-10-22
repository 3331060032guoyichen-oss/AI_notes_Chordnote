/**
 * 一次运行内的读取账本。
 *
 * `readVersions` 只能回答「读过没有」，回答不了「读完了没有」。而整理稿和改写稿
 * 都是拿整份正文替换目标页，只读首页就提交会把后半段静默写丢。这里按
 * 「是否从第一段读起 + 最远读到哪」记覆盖区间，不记精确区间集合。
 *
 * shortcut: 只认「从头读到尾」这一种完整，跳读中间段也算不完整；要精确到区间再升级。
 */
export type ReadCoverage = {
  version: number;
  furthest: number;
  fromStart: boolean;
  complete: boolean;
};

export class ReadLedger {
  private reads = new Map<string, ReadCoverage>();

  /** 材料由宿主直接注入（上下文里的当前文档）时使用。 */
  seed(id: string, version: number, total: number, complete: boolean) {
    this.reads.set(id, { version, furthest: complete ? total : 0, fromStart: true, complete });
  }

  /** 只记版本，不声称读过。用于刚创建、需要后续分类的页面。 */
  remember(id: string, version: number) {
    this.reads.set(id, { version, furthest: 0, fromStart: false, complete: false });
  }

  record(id: string, version: number, offset: number, nextOffset: number, total: number) {
    const previous = this.reads.get(id);
    const fromStart = Boolean(previous?.fromStart) || offset === 0;
    const furthest = Math.max(previous?.furthest ?? 0, nextOffset);
    this.reads.set(id, { version, furthest, fromStart, complete: fromStart && furthest >= total });
  }

  has(id: string) {
    return this.reads.has(id);
  }

  version(id: string) {
    return this.reads.get(id)?.version;
  }

  complete(id: string) {
    return this.reads.get(id)?.complete === true;
  }

  forget(id: string) {
    this.reads.delete(id);
  }
}
