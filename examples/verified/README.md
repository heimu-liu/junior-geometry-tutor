# 可复现的已校验例题

这里的 plan.json 来自实际 Codex CLI 调用，request.json 保留当时题目与范围。lesson/proof-report/learning.html 用最终本地引擎重新编译；不是把固定计划冒充新的模型调用。原始自动调用与浏览器记录保存在源码 tests/verified/evidence-real。

- isosceles70：科学出版社公开样章《作业7 等腰三角形的轴对称性(1)》第6(1)题，填空改为求两底角、展开角名。[原出处](https://www.ecsponline.com/yz/B10A6526763AD4825AB36B4D3C2271BBF000.pdf)。底角各55°。
- kiteSSS：青岛版八上第16页练习2，按题意把∠A、∠C展开为∠BAD、∠BCD，问答改成求证。[原出处](https://v3.ykt.cbern.com.cn/65/document/d726106ca51c11ec9c6bfa20200f090a/pdf.pdf)。用公共边BD完成SSS，再取对应角。保留的是官方PDF索引文字证据；未声称逐像素核对原插图。
- equilateralSSS：同一教材第16页练习1(3)，给两等边三角形及一组等边命名，改成求证。[原出处](https://v3.ykt.cbern.com.cn/65/document/d726106ca51c11ec9c6bfa20200f090a/pdf.pdf)。由等边定义得到三组对应边，使用SSS。

只记录相关题目的必要数学条件，不附整本教材。它们是基础教材练习，不称为中考真题或完整题型覆盖。
