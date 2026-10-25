# 原图与实际场景

图片题的交付包含：原题照片、同题的已校验证明、保留实际物体的重绘。不是只有数学内核返回成功。

## 输入和启动

1. 宿主真正看图，转写当前小题，保留原图文件。把 PNG/JPEG/WebP 的 data URL 写入 `request.photo`；不填照片路径或远程 URL。原图不自动公开或收入示例库。
2. 构图只声明题面已有关系。示意尺寸不作证明前提，尽量保留原图朝向与普通筝形的不等邻边，避免额外特殊关系。
3. `build_page.py --lesson lesson.json --request request.json --presentation presentation.json --output learning.html` 会把原照片和场景嵌入单文件。无场景时省略 presentation。不要删掉 `--request` 后只留照片链接。
4. 需要继续自动接题时：`serve.py --workspace ABS --provider codex --plan plan.json --request request.json --presentation presentation.json --port 0`。启动时重新编译证明，打开返回的实际 URL。宿主与 provider 按 activation.md 选择，不能擅自换模型账号。

## 有限场景模板

目前只有 `geometry-context/1` 的 `doorframe-plumb`，示例：

```json
{"schema":"geometry-context/1","request_id":"与当前请求相同","kind":"doorframe-plumb","anchors":{"top":"A","left":"B","right":"D","bottom":"C","crossing":"E"}}
```

它不接受 HTML、脚本、任意图片 URL 或自由证明文字。五点必须在本题基础图内，AC 竖直、B/D 位于同一门框横边、E 在内部。最后一步必须画出 E 处与线绳和门框对应的已证明直角。所有门框/线绳/铅锤的屏幕位置从同一组几何点计算；场景数据不进入数学定理引擎。最后的“铅垂线竖直，所以门框水平”是该情境的固定解释，不冒充物理命题的符号证明。

不支持的物体：保留原照片，说明当前重绘未覆盖的部分；不能套用门框模板或宣称完整还原。

## 显示与验收

- 原照片是 SVG 画板中的真实图像，以原始图像字节内嵌；原题/重绘/对照只移动视野，不移动笔迹坐标。打开提示时聚焦重绘，可随时切回对照。
- 对应角弧只在相关解释展开后出现；直角与“水平”结论只在最后一步出现，返回上一步或收起提示应撤去它们。
- 新图上传不得清空已有题目、解法和笔迹。学习记录保留图片和绑定场景，PNG 导出包含当前视野中的照片、场景、数学图和笔迹。
- 同题学习页每次重开都固定到本题，不能被最后浏览的旧例题覆盖。文件存在/标题正确不足以验收：实际打开，检查图像像素、三个物体、完整提示、最终情境解释、撤销和移动端控件。
- 保存截图、trace 和检查报告。区分宿主构图修正、自动 CLI 结果、本地证明与页面验收；不把其中一项当成全部完成。
