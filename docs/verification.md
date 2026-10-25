# 验证范围

v0.3.1 简化了启动词和 Agent 操作说明，沿用 v0.3.0 的本地几何/定理内核与画板。新增自然语言入口，不新增 MCP、账号配置或未经验证的宿主连接。

## 已完成的验证

| 层次 | 证据范围 |
| --- | --- |
| 数学内核 | 实现前写好的 36 项正例/反例，含精确中点/垂足、退化构图拒绝、SSS/SAS/ASA/AAS/HL、前提与范围检查 |
| 新协议集成 | 9 个错误计划被本地服务拦截，以及辅助中点/虚线的 5 步浏览器流程，共 10 项 |
| 真实模型 | Codex CLI 实际处理 4 道已出版基础练习（3 类题、9 步）及 2 个超范围/歧义边界场景；不是固定计划回填 |
| 图形 | 三份真实模型计划用最终引擎重编译，再回放完整提示；另验证解压安装包在独立浏览器会话中的流程 |
| 既有交互 | 11 组旧协议界面回归及 38 项 HTTP 集成检查，覆盖绘画/撤销、取消、范围变化、照片、存档、导出及访问限制 |

4 道成功练习包括等腰顶角70°/90°求底角、利用公共边证明全等后取对应角、一边相等的两个等边三角形证明全等。详见 [示例与教材出处](../examples/verified/README.md)。部分题目展开了角名、为图形命名或把填空改成求角；这些是教材练习，不称为中考真题。

“36 项测试通过”不等于支持所有初中题。“源码兼容”不等于所有宿主安装验收：WorkBuddy 客户端、其他 CLI 账号、Windows 和孩子真实使用反馈尚未验证。自动图像识别、逐教材知识映射、按单个全等判定限制掌握程度也尚未实现。

原始模型日志和浏览器 trace 留在本地，避免把运行会话与个人环境带入仓库。这里提供可复现脚本与匿名教材示例。示例不是新的模型调用，也不代表模型答题准确率统计。

## 本地复现

Python 3.10+，核心程序只用标准库：

```sh
python3 tests/verified/core_check.py
python3 scripts/compile_plan.py --plan examples/verified/kiteSSS/plan.json --request examples/verified/kiteSSS/request.json --output learning-data/lesson.json --report learning-data/proof-report.json
python3 scripts/build_page.py --lesson learning-data/lesson.json --request examples/verified/kiteSSS/request.json --output learning-data/learning.html
```

浏览器检查需测试环境可加载 `playwright`，并已安装 Chrome：

```sh
node tests/verified/manual-e2e.cjs
node tests/verified/replay-e2e.cjs
```

真实模型检查会使用自己的 Codex 登录并消耗其额度。启动服务后，在另一终端运行：

```sh
python3 scripts/serve.py --workspace .runtime/verified-v0.3 --provider codex --port 8768 --timeout 240 --no-open
node tests/verified/real-e2e.cjs
```

可用 `CASE=isosceles90 node tests/verified/real-e2e.cjs` 只跑一个用例。结果留在被 Git 忽略的 tests/verified/evidence-* 目录。

触发词用例位于 evals/。它们用于描述路由的启发式检查，不是 WorkBuddy/Codex 原生 Skill 路由准确率的实测。


## 2026-10-24 年级默认范围与门框题（本地）

- 页面与宿主读取同一份 `references/grade-defaults.json`。仅选择年级，不再填写章节或勾选单个定理；旧记录打开和导入时会重新计算默认范围。该表是整学年通用范围，不是逐教材学期进度。
- 既有数学内核检查 36/36、手工计划与本地服务浏览器回归 10/10 通过。新增 `tests/verified/grade-defaults-e2e.cjs` 覆盖三个年级的实际提交、旧记录恢复和导入，共 5 项通过，输出 `evidence-grade-defaults/report.json`、截图和 trace。
- 用户上传的门框题完成一次真实 Codex 自动生成，SSS → 对应角 → SAS → 对应角 → 相等邻补角，目标 `AE⊥BD` 通过校验。自动题图倾斜；宿主调整为竖直铅垂线的示意构图，重新编译后通过画板数据导入。两者均保留来源，不将宿主修正称为模型自动结果。
- 在实际学习画板逐步展开五步，核对依据、公共边、图形联动；最后一步标题不提前显示 90°；返回上一步撤去直角，测试笔迹可撤销，交付时提示收起。原图、证明报告与逐步截图保存在本地学习目录，不进入公开仓库。
- 数学内核检查垂直关系；“铅垂线竖直，因此门框水平”的情境解释由宿主核对。此次未发布 GitHub 新版本。

复现年级流程：在已安装 Playwright 与 Chrome 的测试环境执行 `node tests/verified/grade-defaults-e2e.cjs`。


## 2026-10-24 原图嵌入、门框场景与正确页面（本地修复）

- 门框题完整 E2E 14/14：原图字节哈希和像素加载、三个视图、五步图形联动、最后的水平结论、回退/收起和撤销、上传照片保留题目、学习记录导出/导入、PNG 导出、重开固定本题、手机控件与工具栏避让。原图、截图、trace 与报告保留在用户的本地学习目录，没有进入公共仓库。
- CLI 端到端拒绝 4 个无效输入：直线分点两端重合、非法有理数、另一道题的场景。原有内核 36/36、服务/浏览器 10/10、年级流程 5/5 通过。Skill 验证通过。
- 新的场景是宿主依据照片绑定的有限模板，未调用新一轮模型服务，不宣称通用图片识别或通用物体重绘已验收。数学证明仍由本地有限定理内核复核，场景不进入证明前提。
- 复现：提供本机题目文件目录 `DOORFRAME_DIR`，在有 Playwright 和 Chrome 的环境运行 `node tests/verified/doorframe-photo-e2e.cjs`。输入需有 `original.png`、`request.json`、`plan.json`、`lesson.json`、`presentation.json`。测试通过本机服务重新编译计划，不依赖线上模型。
- 交付的单文件学习页内嵌原图；实时页面用 `serve.py --plan ... --request ... --presentation ...` 启动，固定到本题并重新核对当前可见内容。未创建新 GitHub release。
