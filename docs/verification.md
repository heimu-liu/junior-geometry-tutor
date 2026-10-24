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
