# 声明式几何契约 v1

Skill把一道已确认题目交给Agent生成声明式JSON；本地服务校验后交给画板显示。模型不能提供HTML、SVG源码、JavaScript、CSS、URL或事件处理器。所有讲解与标签均为纯文本，消费端必须用文本节点或转义后渲染。

本规范与`lesson.schema.json`说明数据形状。`scripts/geometry_contract.py`是Python标准库实现的运行时验证器，另行检查引用、显示阶段、数值关系与请求绑定。标准JSON Schema不是各家CLI的严格结构输出格式，不强制使用`--output-schema`；返回JSON后必须经过运行时校验。

## 请求

所有字段必须存在，不允许额外字段。

```json
{
  "schema": "geometry-request/1",
  "id": "new-triangle-40",
  "question": "在△ABC中，AB=AC，∠BAC=40°，求两个底角。",
  "profile": {
    "grade": "7",
    "edition": "人教版",
    "chapter": "等腰三角形与三角形内角和",
    "knowledge": ["angle", "isosceles"],
    "confirmed": true
  },
  "photo": null
}
```

`grade`只能是字符串`7`、`8`、`9`。教材版本最多80字符，章节最多150字符，可以为空；question非空且最多6000字符。`confirmed`必须为布尔true。photo只能是null或PNG/JPEG/WebP的base64 data URL；拒绝SVG、远程URL、非法base64与不匹配的文件签名，解码后最多8MiB。签名校验不等于完整解码或验证图片中的题意。

知识键固定为：`angle`、`area`、`isosceles`、`congruence`、`pythagoras`、`factorization`、`parallel`、`similarity`、`circle`、`quadrilateral`、`coordinate`。知识数组不得重复。判断是否可用以已确认知识为准，年级本身不授予知识权限。

## 课程

顶层字段全部必需：

```text
schema, request_id, id, title, statement, givens, goal,
status, message, questions, profile, scene, methods, audit
```

- `schema`固定`geometry-lesson/1`；`request_id`必须等于请求id；profile必须与请求profile完全相等，不能自行增删知识或改动确认状态。
- title、statement为非空纯文本；givens为纯文本数组；goal、message为纯文本；questions为纯文本数组。
- status为`ready`、`needs_clarification`或`out_of_scope`。
- ready有1–4种方法，每种2–12步。只提供经过复核且在已学范围内的方法，不为凑数重复证明。
- 非ready的methods必须为空，message必须非空；needs_clarification还必须至少有1条questions。其他字段仍须齐全；scene可写成`{"points":{},"base":[],"constraints":[]}`，givens、goal可为空。out_of_scope可没有questions。
- audit固定为`{"summary":"非空纯文本","checks":["复核事项"],"uncertainties":["仍不确定之处"]}`。这是生成者的声明，不是验证器自动给出的证明。

方法形状：

```text
{ id, title, requires: [knowledgeKey], steps: [step] }
step = {
  title, prompt, hint, explanation, uses: [knowledgeKey], reason,
  observe: [primitive], reveal: [primitive]
}
```

方法requires非空且为profile.knowledge的子集。每一步uses非空且为requires的子集；title、prompt、hint、explanation、reason均为非空纯文本。验证器只能检查声明的子集关系，不能保证自然语言没有暗用其他定理。

## 场景与图元

固定视口`0 0 1000 700`，scene固定包含points、base、constraints。

points为名字到坐标`[x,y]`的映射，最多300个。点键符合`[A-Za-z][A-Za-z0-9_]{0,31}`；撇号用显示标签如`A′`，不放在点键里。坐标必须是有限数，x在0–1000，y在0–700；true、false、数字字符串都不是数值。

base最多500个图元。每个图元必须有全课程唯一的id，以及下表的必需字段。id不承担更新语义，base、所有方法所有步骤中的observe/reveal均不得重用id。

|kind|必需字段|可选专用字段|
|---|---|---|
|line|a、b：点键|无|
|polygon|points：3–300个不重复点键|无|
|circle|center：点键；radius：0以上且≤1000|无|
|point|point：点键|label纯文本≤160；dx在−1000..1000；dy在−700..700|
|label|at：视口内坐标；text非空纯文本≤160|无|
|rightAngle|vertex、a、b：点键|size在4..80|

全部图元还可有color、width、dashed、fill、opacity。color只能为`ink`、`amber`、`blue`、`red`；width在1..8；dashed/fill为布尔值；opacity在0.03..1。除此之外的字段全部拒绝。不给出原始SVG path或样式字符串。

直线图元实际上是两点之间的线段。无限直线应由Agent在视口内确定端点后表达为线段，不新增未经协议定义的图元kind。

## 显示阶段与防提前泄题

1. scene.points只是可引用的坐标表，不表示所有点已可见。base中的point图元声明初始可见点；base其他图元只能引用这些点。
2. 每种方法独立从base开始。reveal中的point图元声明新辅助点，同一批reveal可直接用这些点画线；不能重复声明已经可见的点。
3. 当前observe只能引用base和本方法此前reveal中已显示的点，不能引用当前reveal才出现的点。observe禁止point与label图元。
4. observe的line必须与此前已经画出的line具有同一对端点（方向不限）；circle必须同center与radius；rightAngle必须同vertex及两个边点（两边顺序不限）。因此不能把两旧点之间的新辅助线放进observe。
5. observe的polygon可以用已可见点高亮一个区域，但渲染端只绘透明填色，不描边。辅助线、新点、标记、新数值及答案放在reveal；只有点击展开当前步骤后才能显示。

每步observe/reveal分别最多100个图元。不同方法不互相继承辅助点。进入下一步时可以累计此前reveal，但切换方法必须重新按该方法累积。

这些规则能阻止常见的提前画线与未声明点，无法理解标签是否把答案伪装成已知。题干、初始标注、提示语与答案的语义关系仍需生成流程逐步复核。

## 几何约束

constraints最多200条，每条仅有kind、points，以及ratio所需的value。

|kind|points顺序|检查|
|---|---|---|
|perpendicular|A,B,C,D|AB与CD垂直|
|parallel|A,B,C,D|AB与CD平行|
|equal_length|A,B,C,D|AB与CD等长|
|ratio|A,B,C,D|AB长度/CD长度=value，value为有限正数|
|collinear|A,B,C|三点共线，点不能重合|
|midpoint|A,M,B|M是AB的中点，三点不能重合|

向量点积/叉积分别除以两段长度乘积后，以1e-3判断垂直/平行/共线。等长与长度比采用1e-3相对容差。中点到线段两端平均坐标的距离，不超过AB长度的1e-3。

零长线段（≤1e-9像素）拒绝；polygon的相邻顶点不得重合，面积两倍不能小于等于最大边长平方的1e-9。rightAngle无论放在哪个阶段，都检查真实数值垂直，不能只画一个直角符号冒充证明。范围检查不负责所有标签排版、图片识别、约束完备性或自然语言证明。

## 长度、规模与接口

slug以字母或数字开头，只能含字母、数字、下划线、连字符，最多80字符。title最多160；普通正文、说明、数组文字最多6000；message最多2000；普通字符串数组最多32项。

`load_json`只读UTF-8 JSON，文件最多12MiB，拒绝重复键、NaN/Infinity、非对象根节点以及超过48层嵌套。HTTP总请求10MiB由服务层限制。`validate_request`/`validate_lesson`接受已解析对象；调用方若自行解析HTTP JSON，也必须拒绝重复键与非标准常量。

```python
validate_request(data)                 # 返回独立复制的合法请求；否则ValueError
validate_lesson(data, request=None)    # 传request时绑定id和profile；否则只检查课程自身
load_json(path)                       # 读取严格JSON对象；否则ValueError
```

```sh
python3 scripts/geometry_contract.py request examples/new-triangle.request.json
python3 scripts/geometry_contract.py lesson examples/new-triangle.lesson.json --request examples/new-triangle.request.json
```

失败返回带JSON路径的ValueError；CLI失败退出码为1。成功只表示已检查数据形状、知识声明与数值几何，不能表述为“AI证明已经正确”。

## 最短生成说明

把以下说明连同已确认请求交给Agent即可，不需要CLI特有的严格输出参数：

> 只返回一个符合geometry-lesson/1的JSON对象。原样复制request_id与profile；正文和标签只用纯文本。先独立检查题意与数学，再写只使用已学知识的可靠方法；每步标uses和reason。base仅包含原题已知图；新辅助点、线和结论放在reveal，observe只高亮已经存在的图形。所有图元id全局唯一。题意不足用needs_clarification并列出具体问题；无法在范围内解决用out_of_scope。仍保留所有字段。不要输出代码块、HTML、JavaScript或协议外字段。最后根据本规范自检。

完整有效示例位于`examples/new-triangle.request.json`与`examples/new-triangle.lesson.json`：AB=AC、顶角40°，只采用等腰性质与内角和，一条3步方法，最后一步才揭示两个70°。
