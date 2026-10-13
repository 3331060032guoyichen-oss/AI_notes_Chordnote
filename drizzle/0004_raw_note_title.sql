-- 原始记录新增可选的「笔记名」
-- 允许为空：记录原话的门槛不该被标题抬高，未命名时列表回退为正文预览。
ALTER TABLE "raw_notes" ADD COLUMN IF NOT EXISTS "title" text;
