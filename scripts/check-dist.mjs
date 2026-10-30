import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';

const root = resolve(process.argv[2] ?? 'dist');
const markers = ['synthetic-private-token', 'synthetic-model-key', 'synthetic-config-token', '私人示例正文'];
let count = 0;
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, item.name);
    if (item.isSymbolicLink()) throw new Error(`构建产物不应包含符号链接：${relative(root, file)}`);
    if (item.isDirectory()) { await walk(file); continue; }
    if (!item.isFile()) throw new Error(`不支持的构建产物：${relative(root, file)}`);
    const data = await readFile(file);
    for (const marker of markers) if (data.includes(Buffer.from(marker))) throw new Error(`构建产物包含测试隐私标记：${relative(root, file)}`);
    if (file.endsWith('.map')) throw new Error(`构建产物包含源码映射：${relative(root, file)}`);
    count++;
  }
}
try {
  if (!(await stat(join(root, 'index.html'))).isFile()) throw new Error('缺少 index.html。');
  await walk(root);
  console.log(`构建产物检查通过：${count} 个文件；未发现合成隐私标记或源码映射。`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '构建产物检查失败。');
  process.exitCode = 1;
}
