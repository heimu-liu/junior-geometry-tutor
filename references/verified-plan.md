# 本地构图与定理计划 v1

本轮只处理等腰三角形、等边三角形与三角形全等的基础题。只生成 `geometry-plan/1` 数据，不生成坐标、SVG、HTML、解释段落或验证报告。本地程序才是绘图、推理检查和讲解文字的生产者。MCP 不参与。

## 输出格式

所有字段必填：schema、request_id、id、title、status、message、questions、profile、construction、segments、givens、goals、methods。request_id 和 profile 原样复制 REQUEST。id 用短英文；构造、条件和步骤 id 以字母开头，只用字母数字下划线，整题不重复；点名用 A、B、C、D 等单个大写字母。

status 为 ready / needs_clarification / out_of_scope。非 ready 必须提供具体 message，needs_clarification 至少一个 questions；construction、segments、givens、goals、methods 均为空数组。不支持的题型/定理、未学知识、不能绑定题面或证明目标时返回非 ready，不能凑成功解答。

## 1. 构图

construction 元素只有 `{id,op,points,values,stage}`。values 全是有理数字符串（例如 "6"、"1/2"），不是计算表达式。

| op | points | values | 作用 |
| --- | --- | --- | --- |
| isosceles | A,B,C | 底边 BC, 高 | 顶点 A，两腰 AB=AC；B=(0,0)，C 在右侧 |
| isosceles_angle | A,B,C | BC, 顶角 BAC 的度数 | 已知顶角时使用；角度 1–179 |
| triangle | A,B,C | AB,BC,AC | 由三条边构造；可以选择满足题意的一组示意长度，不能把示意长度加入证明 |
| midpoint | D,B,C | 空 | D 是 BC 中点 |
| on_segment | D,B,C | 比例 t | D=B+t(C−B)，0<t<1 |
| on_line | D,B,C | 有理比例 t，不能为 0 或 1 | D=B+t(C−B)，可在延长线上；仅为构图参数 |
| foot | D,A,B,C | 空 | 从 A 向直线 BC 作垂足 D |
| reflection | D,A,B,C | 空 | 将 A 关于直线 BC 反射得到 D |
| intersection | X,A,B,C,D | 空 | 直线 AB 与 CD 的唯一交点 |

前三种一次创建三个点，其余只创建 points[0]，其他点必须已经存在。不能重复定义点。多个独立三角形会自动错开放置。stage="base" 表示题目初始图；辅助点的 stage 必须是引入它的构造步骤 id。种子三角形 stage 必须为 base。

segments 元素为 `{points:[A,B],stage:"base"}`，至少三段。所有需要画出的线段都在这里声明；已有点之间的辅助线可在证明步骤的 stage 出现。引入辅助点只支持 construct_midpoint、construct_foot；其 op、points、stage 必须严格匹配。不要在初始图画出解题辅助线。

本地计算仅保证条件一致，坐标上的偶然相等、直角和镜面对称不能成为证明前提。有理数保留分数；开方和三角函数采用浮点并检查误差，不能宣称任意图形采用符号精确求解。

## 2. 已知与目标

事实只有 `{kind,points,value}`；除 angle_value 外 value 必须为空字符串。

| kind | points | 含义 |
| --- | --- | --- |
| length_eq | A,B,C,D | AB=CD |
| angle_eq | A,B,C,D,E,F | ∠ABC=∠DEF |
| angle_value | A,B,C | ∠ABC=value 度，必须为有理数 |
| midpoint | M,B,C | M 是 BC 中点 |
| between | B,M,C | M 在线段 BC 内部 |
| perpendicular | A,B,C,D | AB⊥CD |
| bisector | B,A,D,C | AD 平分 ∠BAC |
| equilateral | A,B,C | ABC 是等边三角形 |
| congruent | A,B,C,D,E,F | ABC≌DEF，仅可推导或作目标，不能直接作为 given |

givens 每项加 id、source，source 是题干已知部分的连续原文，不得取自所求或求证部分。显式等式、中点、直角和等边条件可绑定；复杂语义无法绑定时先请求明确表述。不要把从图上量出的关系、学生猜测或作图参数列为已知。题干的必要条件不能遗漏。

goals 是全部待证/待求事实。计算题的目标可含已算出的值，最终答案由本地核验；初始画板不显示该值。支持题面末尾明确写“求证 AD⊥BC”“求证∠BAD=∠BCD”“求证△ABC≌△DEF”“求∠ABC和∠ACB的度数”。点名缺失、多个角共用简写或题意依赖图片时先澄清。goal 必须完整覆盖题目要求，不能换成较容易证明的结论。

## 3. 证明步骤

methods 每项 `{id,title,steps}`；1–3 种方法，每种 2–12 步。仅在实质不同且都能验证时多解，不能强行凑数。steps 每项 `{id,rule,points,premises}`。premises 只引用本题 given id 或本方法的前序 step id；一个 step 的全部推导事实一起可用。公共边相等可隐式使用；其他缺失前提不得省略。每种方法独立完成全部 goals。

| rule | points | 必要前提 / 输出 | 学习范围 |
| --- | --- | --- | --- |
| midpoint_definition | D,B,C | 中点 → BD=DC，D 在 BC 内 | angle |
| bisector_definition | B,A,D,C | 平分角 → BAD=DAC | angle |
| equilateral_sides | A,B,C | 等边 → AB=BC=AC | isosceles |
| isosceles_base_angles | A,B,C | AB=AC → ABC=ACB | isosceles |
| isosceles_converse | A,B,C | ABC=ACB → AB=AC | isosceles |
| equal_base_angle_values | A,B,C | 两底角相等 + 顶角值 → 两底角各 (180−顶角)/2 | angle |
| triangle_angle_sum | A,B,C | 两个内角值 → 第三个内角值 | angle |
| SSS | A,B,C,D,E,F | 三组对应边 | congruence |
| SAS | A,B,C,D,E,F | 两组对应边 + 夹角 | congruence |
| ASA | A,B,C,D,E,F | 两组对应角 + 夹边 | congruence |
| AAS | A,B,C,D,E,F | 两组对应角 + 非夹边 | congruence |
| HL | A,B,C,D,E,F | 两个明确 90° 内角 + 对应斜边 + 对应直角边 | congruence |
| corresponding_side | A,B,D,E | 已证全等 → AB=DE（按对应顺序） | congruence |
| corresponding_angle | A,B,C,D,E,F | 已证全等 → ABC=DEF（按对应顺序） | congruence |
| equal_linear_pair | A,D,B,C | D 在 BC 内、ADB=ADC → 两角 90°、AD⊥BC | angle |
| right_angles_equal | A,B,C,D,E,F | 两角各 90° → 相等 | angle |
| construct_midpoint | D,B,C | 和同阶段 midpoint 构造匹配 → 中点、分段相等 | angle |
| construct_foot | D,A,B,C | 和同阶段 foot 构造匹配 → AD⊥BC | angle |

没有 SSA、AAA、三线合一快捷规则、角度传递规则或任意“显然”规则。需要这些但无法用目录中的步骤展开时不要编造新 rule。construct_foot 当前只给出 perpendicular，不能直接当作两个 angle_value 来套 HL。

等价角依赖被引用的 between/midpoint 来识别同向射线。引用前提要完整。例如 D 在 BC 内，使用 ∠ABD=∠ACD 时要一并引用说明 D 在线段内的步骤。

学习范围为 REQUEST.profile.knowledge，由页面或宿主根据 `grade-defaults.json` 自动设置。默认表按整学年提供常用范围，不等于个人掌握清单或逐教材学期进度。模型先选合适路线，本地按实际 rule 的固定知识分类再次拦截。当前全等是一个整体类别；不要求孩子逐项维护 SSS、SAS、HL 等清单。

## 示例套路（不能把示例条件抄入新题）

AB=AC、∠BAC=70°，求 B、C：isosceles_angle 取任意底边 6 和顶角 70；给定 length_eq 与 angle_value；s1 isosceles_base_angles 引用相等两腰；s2 equal_base_angle_values 引用 s1 与顶角值。只需要两步。

AB=CB、AD=CD，求 BAD=BCD：先 triangle 构造 [A,B,D]（选不等的三边如 5,6,4），再 reflection [C,A,B,D] 得到另一半。四条边初始可见，BD 在 s1 才出现。s1 SSS [A,B,D,C,B,D] 引用两组题目等式；s2 corresponding_angle [B,A,D,B,C,D] 引用 s1。反射只是画图方法，证明中不能以“反射”代替 SSS。
