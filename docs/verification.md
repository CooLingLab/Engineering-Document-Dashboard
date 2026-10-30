# 验证记录

## 2026-10-30 本地开发阶段

- 真实公开 GitHub 读取：已使用 `CooLingLab/Engineering-Document-Dashboard-test-target` 验证 `main` 与 `test/iteration` 两个分支，测试内容为虚构 Markdown。浏览器也曾实际连接并切换这两个分支。
- 在隔离临时目录执行 `npm ci` 成功；`npm run typecheck` 通过，`npm test` 为 132 项通过、1 项需显式开启的真实网络测试默认跳过。该真实网络测试另行开启并通过。
- 模拟 GitHub 与模型：Chromium（本机 Chrome）和 Playwright WebKit 的 18 项浏览器测试全部通过，覆盖分支、手动状态、图编辑、配置同步、冲突、按需分析、旧依据提示、键盘操作和 GitHub Pages 子路径刷新。测试使用合成数据及请求拦截。
- 视觉检查：查看了 1280px 桌面及 390px 窄屏截图，另以浏览器断言检查窄屏导航、长中文标题和页面横向溢出。
- `npm run build` 与 `npm run check:dist` 通过；Vite 对主 JavaScript 包大于 500 kB 给出体积警告。
- 真实私有仓库读取和真实配置仓库写入：尚未验证；模拟成功不代表实际令牌权限与组织策略已验证。
- 真实在线模型和真实本机 Ollama：尚未验证；模拟协议测试不代表任何提供商、模型或跨域设置已通过实测。
- Playwright WebKit 是浏览器引擎测试，不等于实际 Safari 或 macOS 本地网络权限验证。

## 限制

- GitHub API 的访问权限、频率限制和组织策略由访问者的账户决定。错误时保留已有草稿并显示提示。
- 模型生成的摘要仍可能包含敏感信息或短篇幅原文，用户应在保存配置前检查；长原文摘录过滤不能保证覆盖所有复述。
- 页面关闭后，未保存的草稿与内存令牌无法恢复；GitHub 同步需要用户主动保存。
