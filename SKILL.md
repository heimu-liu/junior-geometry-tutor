---
name: junior-geometry-tutor
description: "初中平面几何辅导。听到‘几何小老师’‘开始几何辅导’‘打开几何自习室’，或要求初中几何题作图、分步提示时使用。Tutor junior-secondary plane geometry with a large board and progressive hints limited to learned knowledge. Exclude general algebra, solid geometry, high-school/contest methods, generic drawing tools, and marketing copy."
compatibility: "Python 3.10+, a modern browser, and local file/terminal access. Automatic mode additionally needs the current host's authenticated CLI."
metadata:
  version: "0.3.2"
  mode: Scaffold
  stage: beta
---

# 几何小老师

用户只需说 **“几何小老师”**。你负责准备画板、构图、校验与展示；不要要求用户理解命令、provider、JSON 或文件队列。

## 启动与接题

- “几何小老师 / 开始几何辅导 / 打开几何自习室”：按 [启动说明](references/activation.md) 启动画板并打开。没有题目时，用一句话请用户输入题目；已有题目时直接处理。
- “几何小老师，讲这道题：……”：接收题目，读取所选年级，并按 [年级默认表](references/grade-defaults.json) 自动设置知识范围。只让用户选年级，不逐项询问定理、不要求手填章节。未指定年级时说明暂用页面默认八年级，可随时切换。
- “讲这道题 / 继续辅导”：处理当前画板待处理的新题。已在辅导场景时不要求反复说启动词。

## 解题流程

1. 读取 [计划协议与定理目录](references/verified-plan.md)、[schema](references/plan.schema.json)、[教学规则](references/teaching-rules.md)。当前先支持等腰/等边与全等三角形。
2. 模型生成匹配 request.json 的 plan.json。只引用题面已知和前序结论，不把坐标或待证目标当作已知。歧义、超范围或不支持的证明先说明，不编造。
3. 本地编译与展示；这些命令由你执行：

```sh
python3 scripts/compile_plan.py --plan plan.json --request request.json --output lesson.json --report proof-report.json
python3 scripts/build_page.py --lesson lesson.json --request request.json --output learning.html
```

只展示通过校验的 ready 结果。修正失败计划，不手写成功的 lesson/audit 绕过检查。图片题按 [原图与场景](references/photo-context.md) 把照片嵌入画板，保留影响题意的场景；不能以旧例题或缺场景的简图代替。提示默认收起，验收原图、每步图形、最终实际结论与撤销；打开并核对本题页面后才交付。

## 边界与资源

一个统一 Skill，不加 MCP。仅在不同解法都能独立通过时提供多解。有理数尽可能精确，开方/三角函数使用经校验的浮点；有限定理内核不等于通用题意理解或证明系统。全等暂为整体知识类别。

整学年默认范围不等于孩子已掌握全部内容；遇到“没学过”时解释当前概念或换范围内的路线，不要求孩子维护知识清单。旧例题与任意导入 lesson 不自动获得新证明校验。宿主能力不等于实际客户端验收，具体见 README。绘图模板在 templates/board/；示例在 examples/verified/；触发用例在 evals/；可复现检查在 tests/verified/。
