export type Raw = {
  id: string;
  /** 笔记名。可选：未命名时列表回退为正文预览。 */
  title: string | null;
  text: string;
  createdAt: string;
};

export type RawInput = Pick<Raw, "text"> & { title?: string | null };
