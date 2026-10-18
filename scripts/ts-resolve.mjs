/**
 * 给 `node --test` 用的解析钩子。
 *
 * 仓库里的 import 不带扩展名（Next/TS 的 `moduleResolution: bundler` 负责补全），
 * 而 Node 自带的类型剥离只认带扩展名的相对路径。这个钩子把两者接上，
 * 让离线测试可以直接跑真实的 `.ts` 源文件，不引入 tsx / ts-node。
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const extension of [".ts", ".tsx", ".js"]) {
        const candidate = new URL(specifier + extension, context.parentURL);

        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
    }

    return nextResolve(specifier, context);
  },
});
