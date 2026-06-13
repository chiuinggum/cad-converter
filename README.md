# WonderCAD — 工程图纸 → 3D 零件 调研与 Hackathon 方案

> **Hackathon 主题（Kyrall）**：*Turning a technical drawing into a 3D part*  
> 将技术图纸自动转换为可制造、可编辑的 3D 参数化模型。全球存在数十万份缺少对应 3D 模型的 legacy 工程图，这是制造业数字化的高价值场景。

---

## 1. 为什么这个题目「很论文」？

这个方向在 2023–2026 年集中爆发了一批顶会论文，且**问题定义、数据集、评测指标都高度学术化**：

| 学术特征 | 现实含义 |
|---------|---------|
| 输入多为**三视图正交投影**（front/top/side） | 真实图纸可能是单页多视图、剖视图、局部放大、手写标注 |
| 输出多为 **Sketch-Extrude 序列** 或 **Shape Program** | 工业需要 STEP/B-Rep、公差、螺纹、装配关系 |
| 训练数据来自 **DeepCAD / 合成柜子** | 与真实 PDF/DWG 扫描件分布差异大 |
| 评测用 **Chamfer Distance / IoU / CD-TR** | 工程验收看尺寸链、可编辑性、可制造性 |
| 方法分 **端到端学习 vs Agent 迭代** 两大阵营 | Hackathon 需要选「能 demo 的路径」而非追 SOTA |

**结论**：这不是「调一个 API 就完事」的题目，而是**计算机视觉 + 几何推理 + CAD 内核 + LLM Agent** 的交叉问题。Hackathon 胜出的关键是：**闭环验证 + 可导出 STEP + 可演示的简单零件**，而不是复现论文指标。

---

## 2. 问题拆解

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ 输入            │     │ 中间表示          │     │ 输出                │
├─────────────────┤     ├──────────────────┤     ├─────────────────────┤
│ PDF/PNG 扫描图  │ ──► │ 结构化语义        │ ──► │ 参数化 CAD (STEP)   │
│ DXF/DWG 矢量图  │     │ · 视图/线段/隐藏线│     │ CadQuery/build123d  │
│ 三视图+尺寸标注 │     │ · 尺寸/公差/特征  │     │ FreeCAD/SolidWorks  │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
```

### 2.1 核心难点

1. **视图理解**：实线/虚线、剖面、局部视图、第一/第三角投影
2. **尺寸关联**：尺寸标注与几何特征的对应（GD&T 更难）
3. **欠约束**：三视图无法唯一确定 3D（需默认厚度、对称假设）
4. **输出形态**：Mesh（STL）易生成但不可编辑；B-Rep/参数化才是工业价值
5. **验证闭环**：一次生成几乎必然有错，需要「生成 → 渲染对比 → 修正」

### 2.2 工业 vs 学术的目标差异

| 维度 | 学术论文 | Hackathon / 产品 |
|------|---------|-----------------|
| 零件类型 | 柜子板件、DeepCAD 拉伸体 | 支架、法兰、简单机加工件 |
| 输入 | 干净 SVG/合成三视图 | 扫描 PDF、拍照、旧 DWG |
| 成功标准 | Chamfer ↓ 几个点 | 工程师能打开 STEP 并改一个尺寸 |
| 时间 | 训练数周 | 48–72h 可跑通 pipeline |

---

## 3. 技术路线全景（2023–2026）

### 路线 A：序列学习 — 图纸 → CAD 操作序列

将 2D 图元序列映射到 Sketch-Extrude / Shape Program 序列。

| 论文 | 会议 | 核心思路 | 输入 | 输出 |
|------|------|---------|------|------|
| [PlankAssembly](https://arxiv.org/abs/2308.05744) | ICCV 2023 | Transformer + Shape Program | 三视图 SVG 线框 | 柜体板件程序 |
| [Drawing2CAD](https://arxiv.org/abs/2508.18733) | ACM MM 2025 | Dual-decoder Transformer, seq2seq | 矢量 SVG 四视图 | DeepCAD 命令序列 |
| [DeepCAD](https://arxiv.org/abs/2105.09492) | ICCV 2021 | 自回归 CAD 序列生成（基础工作） | — | 命令序列 |

**优点**：几何精度高、可评测  
**缺点**：需矢量输入；泛化到扫描图差；训练成本高

### 路线 B：视觉-语言模型 — 图纸图像 → 文本/代码

把工程图当普通图像，用 VLM 直接预测 3D 描述或代码。

| 论文 | 会议 | 核心思路 | 输入 | 输出 |
|------|------|---------|------|------|
| [CAD2Program](https://arxiv.org/abs/2412.11892) | AAAI 2025 | 微调 InternVL，图像→文本 Shape Program | 光栅工程图 | 文本形式参数模型 |
| [CReFT-CAD](https://arxiv.org/abs/2506.00568) | NeurIPS 2025 | RL + SFT 两阶段微调 VLM | 三视图光栅图 | 参数列表 / CAD 推理 |
| [CAD-Coder (VLM)](https://arxiv.org/abs/2505.14646) | arXiv 2025 | 微调 LLaVA，图像→CadQuery | 渲染图 | CadQuery Python |
| [CAD-Coder (Text)](https://papers.neurips.cc/paper/2025/hash/564a224e88f2490f3c1deaae877d37e3-Abstract-Conference.html) | NeurIPS 2025 | CoT + GRPO 强化学习 | 文本描述 | CadQuery Python |

**优点**：对输入格式宽容（PNG 即可）；易与 LLM 生态结合  
**缺点**：尺寸精度不稳定；需大量微调数据

### 路线 C：Agent 闭环 — 生成代码 + 多轮验证修正 ⭐ **Hackathon 推荐**

不追求一次生成正确，而是 **Generate → Execute → Render → Compare → Refine**。

| 工作 | 类型 | 核心思路 |
|------|------|---------|
| [IterCAD](https://arxiv.org/html/2606.13368) | 论文 2026 | Drawing-to-Code，OCCT 投影反馈 + 多轮修正 |
| [Drawing Agent](https://drawing-agent.com/) | 商业产品 | CadQuery 自评估循环，多视图对比收敛 |
| [CADSmith](https://github.com/jabarkle/CADSmith) | 开源 | 多 Agent：Planner/Coder/Validator/Refiner |
| [agentcad](https://github.com/jdilla1277/agentcad) | 开源 | CAD 执行沙箱，JSON 指标 + 多视图渲染 |
| CCTech Hackathon 2026 获奖方案 | 工业 Hackathon | Bounding-box 结构化 prompt + 2D→3D pipeline |

**优点**：48h 内可搭 MVP；不依赖自训练模型；可接 GPT-4V/Claude/Gemini  
**缺点**：API 成本；复杂装配仍困难

### 路线 D：传统几何 + OCR 流水线

先解析图纸语义，再约束求解或参数化建模。

| 组件 | 代表项目 | 作用 |
|------|---------|------|
| 尺寸 OCR | [eDOCr2](https://github.com/javvi51/edocr2), [DimSense](https://github.com/Ojas-04Panse/YOLOv8-based-Semantic-Segmentation-of-Dimension-Text-and-Tolerances) | 检测/识别尺寸、公差 |
| DXF 解析 | [ezdxf](https://github.com/mozman/ezdxf) | 矢量图元提取 |
| 图纸-模型对齐 | [DrawMind3D](https://github.com/NWichter/DrawMind3D) | PDF 标注 ↔ STEP 特征匹配 |
| CAD 内核 | CadQuery, build123d, FreeCAD, pythonocc | B-Rep 实体生成 |

**优点**：可解释、尺寸可控  
**缺点**：pipeline 长；对非标准图纸脆弱

---

## 4. 开源仓库地图

### 4.1 直接相关（2D 图纸 → 3D）

| 仓库 | Stars* | License | 说明 |
|------|--------|---------|------|
| [manycore-research/PlankAssembly](https://github.com/manycore-research/PlankAssembly) | ~100 | AGPL-3.0 | 三视图→柜体 Shape Program，ICCV 2023 |
| [lllssc/Drawing2CAD](https://github.com/lllssc/Drawing2CAD) | ~130 | MIT | 矢量 SVG→CAD 序列，含 CAD-VGDrawing 数据集 |
| [lllssc/STEP2SVG-Pipeline](https://github.com/lllssc/STEP2SVG-Pipeline) | — | — | CAD→工程图 SVG 导出管线 |
| [KeNiu042/CReFT-CAD](https://github.com/KeNiu042/CReFT-CAD) | ~20 | — | TriView2CAD 数据集 + VLM 微调，NeurIPS 2025 |
| [anniedoris/CAD-Coder](https://github.com/anniedoris/CAD-Coder) | — | — | 图像→CadQuery，GenCAD-Code 163k 对 |
| [gudo7208/CAD-Coder](https://github.com/gudo7208/CAD-Coder) | — | — | 文本→CadQuery，CoT + GRPO，NeurIPS 2025 |

> *Stars 为调研时约数，以 GitHub 实时为准。

### 4.2 CAD 生成基础设施工

| 仓库 | 说明 |
|------|------|
| [rundiwu/DeepCAD](https://github.com/rundiwu/DeepCAD) | 178K CAD 序列数据集 + 生成模型，ICCV 2021 |
| [SadilKhan/Text2CAD](https://github.com/SadilKhan/Text2CAD) | 文本→CAD 序列，NeurIPS 2024 Spotlight |
| [CadQuery/cadquery](https://github.com/CadQuery/cadquery) | Python 参数化 CAD，输出 STEP |
| [gumyr/build123d](https://github.com/gumyr/build123d) | 现代 Python CAD API |
| [mlightcad/awesome-cad](https://github.com/mlightcad/awesome-cad) | 开源 CAD 生态索引 |

### 4.3 Agent / 闭环验证

| 仓库 | 说明 |
|------|------|
| [jabarkle/CADSmith](https://github.com/jabarkle/CADSmith) | 多 Agent + OCCT 几何验证 + VLM Judge |
| [jdilla1277/agentcad](https://github.com/jdilla1277/agentcad) | Agent 用 CAD CLI：run/render/diff/inspect |
| [BoYuanVisionary/Pro-CAD](https://github.com/BoYuanVisionary/Pro-CAD) | 澄清式 Text-to-CAD，ICML 2026 |

### 4.4 图纸理解 / OCR

| 仓库 | 说明 |
|------|------|
| [javvi51/edocr2](https://github.com/javvi51/edocr2) | 工程图分割 + OCR |
| [NWichter/DrawMind3D](https://github.com/NWichter/DrawMind3D) | PDF 标注解析 + STEP 孔特征匹配 |
| [mozman/ezdxf](https://github.com/mozman/ezdxf) | DXF 读写与渲染 |

### 4.5 商业参考

商业化平台全景见 **[第 9 节](#9-商业化平台调研)**。与 Hackathon 题目最直接相关的是 Drawing Agent、Theia、SelectAM Leap3D；技术标杆是 Zoo.dev。

---

## 5. 数据集资源

| 数据集 | 规模 | 模态 | 来源 |
|--------|------|------|------|
| DeepCAD | ~178K | CAD 命令序列 | ABC/Onshape 子集 |
| Text2CAD | ~170K 模型 + 660K 文本 | 文本 + CAD 序列 | 基于 DeepCAD 标注 |
| PlankAssembly | ~26K | 三视图 SVG + Shape Program | 柜体设计 |
| CAD-VGDrawing | Drawing2CAD 发布 | SVG 四视图 + CAD 序列 | 基于 DeepCAD |
| TriView2CAD | 200K 合成 + 3K 真实 | 三视图 + 尺寸标注 | CReFT-CAD |
| GenCAD-Code | 163K | 图像 + CadQuery 代码对 | CAD-Coder |

**Hackathon 数据策略**：
- **Demo**：用 DeepCAD/Drawing2CAD 样本「逆向」—— 用已有 3D 渲染成工程图，再跑重建，可量化误差
- **真实感**：找 5–10 个简单机加工件（支架、垫片、轴套）手工制图或从 TraceParts 类库导出
- **不要**在 48h 内从零训练 Transformer

---

## 6. 评测指标

| 指标 | 用途 | 工具 |
|------|------|------|
| Chamfer Distance (CD) | 点云几何相似度 | trimesh, 论文通用 |
| IoU | 体素重叠 | 3D 评测 |
| 代码 Valid Rate | CadQuery 能否执行 | agentcad / 沙箱 |
| CD-TR (IterCAD) | 容差内几何召回 | 论文提出 |
| 人工评审 | 可编辑性、尺寸一致性 | Demo 必做 |

---

## 7. Hackathon 推荐方案

### 7.1 目标定位

**不做**：复现 Drawing2CAD 端到端训练  
**要做**：**Drawing-to-CadQuery Agent**，输入三视图/单页工程图，输出可打开 STEP，带可视化对比

### 7.2 系统架构（MVP）

```
                    ┌──────────────────────────────────────┐
                    │         Input Layer                  │
                    │  PNG/PDF  │  DXF (ezdxf)  │  三视图   │
                    └────────────┬─────────────────────────┘
                                 ▼
                    ┌──────────────────────────────────────┐
                    │      Perception Layer                │
                    │  VLM: 视图类型、轮廓、孔、尺寸列表    │
                    │  OCR: eDOCr2 / PaddleOCR (可选)      │
                    └────────────┬─────────────────────────┘
                                 ▼
                    ┌──────────────────────────────────────┐
                    │      Reasoning Layer (LLM)           │
                    │  生成结构化 Design Spec (JSON)       │
                    │  · 特征列表 · 尺寸 · 拉伸方向       │
                    └────────────┬─────────────────────────┘
                                 ▼
                    ┌──────────────────────────────────────┐
                    │      Code Generation                 │
                    │  CadQuery / build123d Python         │
                    └────────────┬─────────────────────────┘
                                 ▼
                    ┌──────────────────────────────────────┐
                    │      Execution Sandbox               │
                    │  agentcad run → STEP + 四视图 PNG    │
                    └────────────┬─────────────────────────┘
                                 ▼
                    ┌──────────────────────────────────────┐
                    │      Verification Loop (≤5 轮)       │
                    │  VLM: 生成图 vs 输入图 逐视图对比     │
                    │  几何: bbox 尺寸、体积、孔数          │
                    │  Fail → Refiner 改代码               │
                    └────────────┬─────────────────────────┘
                                 ▼
                    ┌──────────────────────────────────────┐
                    │      Output                          │
                    │  STEP + STL + CadQuery 源码 + 对比图  │
                    └──────────────────────────────────────┘
```

### 7.3 48–72 小时里程碑

| 阶段 | 时间 | 交付 |
|------|------|------|
| **Day 0** | 4h | Fork agentcad/CADSmith，跑通 CadQuery→STEP→渲染 |
| **Day 1 AM** | 4h | 单张等轴/三视图输入 → LLM 生成 CadQuery（无验证） |
| **Day 1 PM** | 4h | 加入 VLM 对比闭环，简单方块/支架类零件成功 |
| **Day 2 AM** | 4h | 尺寸 OCR 或 VLM 读尺寸，提升精度 |
| **Day 2 PM** | 4h | Web UI：上传图 → 进度 → 3D 预览 + 下载 STEP |
| **Day 3** | 缓冲 | 准备 demo 数据、对比 slide、失败 case 分析 |

### 7.4 零件范围（务必收敛）

✅ **支持**：
- 单件机加工件（板类、轴类、简单凸台）
- 以拉伸/旋转为主的原语
- 通孔、盲孔、倒角
- 明确标注尺寸的三视图

❌ **首版不做**：
- 焊接装配体
- 曲面、放样、复杂 GD&T
- 扫描件去噪（可展示为 future work）
- 自训练 VLM

### 7.5 技术栈建议

```yaml
Language: Python 3.10+
CAD: build123d 或 CadQuery 2.x
Kernel: OpenCASCADE (via cadquery-ocp)
Agent Sandbox: agentcad
VLM: GPT-4o / Claude Sonnet / Gemini 2.5 (多模态)
OCR (optional): eDOCr2, PaddleOCR
DXF: ezdxf
Web: FastAPI + Three.js / model-viewer
Eval: trimesh (Chamfer), 自研视图 SSIM
```

### 7.6 与论文工作的关系（答辩话术）

| 我们的选择 | 对应学术工作 | 差异 |
|-----------|-------------|------|
| Agent 闭环 | IterCAD, Drawing Agent, CADSmith | 不自训练，用商用 VLM API |
| CadQuery 输出 | CAD-Coder, Pro-CAD | 输入是工程图而非文本/渲染图 |
| 视图理解 prompt | CReFT-CAD, CAD2Program | 不做 RL 微调，用 structured prompt |
| 评测 | Drawing2CAD, PlankAssembly | 增加「工程师可编辑 STEP」维度 |

---

## 8. 风险与应对

| 风险 | 应对 |
|------|------|
| VLM 幻觉尺寸 | 优先 DXF 矢量输入；尺寸单独 OCR 校验 |
| CadQuery 执行失败 | 沙箱捕获 traceback 喂回 Refiner |
| 三视图欠约束 | 交互式追问默认厚度/材料去掉 |
| API 延迟 | 限制迭代 3–5 轮；缓存中间结果 |
| Demo 翻车 | 准备 2 个「逆向渲染」样本保证成功 |

---

## 9. 商业化平台调研

> 调研日期：2026-06-13。商业产品迭代快，定价以官网为准。

### 9.1 市场格局总览

商业化产品可按**输入模态**和**产品形态**分类：

```
                        商业化 AI-CAD 格局
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   2D 图纸 → 3D          文本/草图 → 3D         3D → 2D 图纸
   (Hackathon 核心)      (主流创业方向)        (传统 CAD 增强)
        │                     │                     │
  Drawing Agent          Zoo.dev / Ragnar        DraftAid
  Theia                  CADAM / AdamCAD         Autodesk Fusion
  SelectAM Leap3D        Orville / Nora3D        (Automated Drawings)
  Kyrall (主办方)
```

**关键洞察**：
- **真正做「2D 工程图 → 3D CAD」的商业产品很少**，多数是 Text/Image-to-CAD 的泛化能力顺带支持工程图
- **Zoo.dev 是当前技术标杆**，但主战场仍是 Text-to-CAD，工程图重建在 roadmap 而非成熟产品
- **闭环迭代**（生成→渲染→对比→修正）是商业产品与学术论文的共同趋势
- **输出格式**决定工业价值：STEP/B-Rep > OpenSCAD > STL Mesh

---

### 9.2 Zoo.dev（重点）

| 项 | 内容 |
|----|------|
| 官网 | https://zoo.dev |
| 公司 | KittyCAD Inc.（美国），自研几何引擎 |
| 核心产品 | Zoo Design Studio、Zookeeper Agent、ML-ephant API、KCL 语言 |
| 技术博客 | https://zoo.dev/research/zookeeper |

#### 产品矩阵

| 产品 | 形态 | 说明 |
|------|------|------|
| **Zoo Design Studio** | 桌面 CAD 应用（免费下载） | AI-native CAD，点选建模 + 代码建模（KCL）+ Zookeeper 对话 |
| **Zookeeper** | 内置 Conversational Agent（2026.01 发布） | 从 Text-to-CAD 演进，可创建/检查/修改模型、做设计评审 |
| **ML-ephant API** | 开发者 REST API | `POST /ai/text-to-cad/{format}` 生成 STEP 等格式 |
| **KCL** | 领域语言 | 几何的文本表示，可版本管理，类似「CAD 界的 OpenSCAD/CadQuery」 |

#### 技术路线（与学术工作的对应）

Zoo 的公开研究文章揭示了其工程决策，与 IterCAD / CADSmith 高度同构：

1. **放弃直接 Text-to-B-Rep 神经网络**（DeepCAD 路线），转向 **LLM + 代码（KCL）+ CAD 引擎执行**
2. Text-to-CAD（2023.12）本质已是 **Agent**：Plan → 写 KCL → 执行 → 观察错误 → 修正
3. Zookeeper 增加：**多视图截图审查**、质心/体积/表面积计算、读文档、理解选中对象
4. 强调 **B-Rep 而非 Mesh**——与制造业工作流对齐

#### 输入能力（与 Hackathon 的关系）

| 输入类型 | 当前状态 | 备注 |
|---------|---------|------|
| 文本描述 | ✅ 成熟 | 最长约 1000 词 prompt |
| 草图/图片 | 🔄 Roadmap | 官方称下一版支持 Zookeeper 图片附件 |
| 2D 工程图/PDF | ❌ 非主业 | 无专用三视图重建 pipeline |
| STEP/STL 逆向 | 🔄 Roadmap | 计划从静态几何反推可编辑 KCL |

> **对 Hackathon 的启示**：Zoo 验证了「Agent + 代码 + 引擎验证」是商业可行路径，但其 **2D 工程图重建尚未产品化**——这正是你们可以差异化的空间。

#### API 与定价

| 项 | 详情 |
|----|------|
| API 端点 | Text-to-CAD 生成、迭代修改、多文件项目迭代、格式转换 |
| SDK | Python / TypeScript / Go / Rust |
| 免费额度 | 约 20 分钟 API 用量（$10 余额） |
| 按量计费 | ~$0.0083/秒 |
| 订阅 | 免费层约 20 credits；Pro 约 **$99/月**（第三方评测） |
| 企业版 | 专有数据微调 Text-to-CAD、SSO、无限 Zookeeper credits |

```python
# ML-ephant API 示例（官方文档模式）
from kittycad.api.ml import create_text_to_cad
from kittycad.types import FileExportFormat, TextToCadCreateBody

response = create_text_to_cad.sync(
    client=client,
    output_format=FileExportFormat.STEP,
    body=TextToCadCreateBody(prompt="Flange with 6 bolt holes, 100mm OD"),
)
```

#### 导出格式

STEP, STL, OBJ, glTF, PLY

#### 优势 / 局限

| ✅ 优势 | ⚠️ 局限 |
|--------|--------|
| 自研 B-Rep 引擎，输出真正可编辑实体 | 2D 工程图重建不是当前卖点 |
| Agent 深度集成引擎（非套壳 GPT） | 闭源模型，难复现论文级实验 |
| 开放 API，可嵌入自有工作流 | 复杂装配/公差/GD&T 能力有限 |
| 企业可微调内部设计标准 | KCL 生态小于 CadQuery/OpenSCAD |

---

### 9.3 直接竞品：2D 工程图 → 3D

与 Hackathon 题目**最直接对标**的产品：

| 产品 | 官网 | 输入 | 输出 | 核心差异 | 定价 |
|------|------|------|------|---------|------|
| **Drawing Agent** | [drawing-agent.com](https://drawing-agent.com/) | PNG/PDF/DXF/DWG | STEP/STL/GLB + CadQuery 源码 | **自评估闭环**：Claude 写代码 → Gemini 逐视图对比 → 最多 10 轮迭代 | 免费 3 次；SaaS 约 ¥50,000/月（50 次生成） |
| **Theia** | [theia2d3d.com](https://theia2d3d.com/) | PDF/TIF/PNG | STEP（ISO 10303） | **人工工程师复核**，偏工业级逆向 | 按复杂度报价，有免费 credits |
| **SelectAM Leap3D** | [selectam.io](https://selectam.io/) | PDF 批量 | 近似 3D（用于 AM 评估） | 目标不是精确 CAD，而是**判断零件是否适合 3D 打印** | Identify 平台内 |
| **Kyrall** | [kyrall.ghost.io](https://kyrall.ghost.io/) | 文本/草图/文档/图片 | 可制造 3D 模型 | **Hackathon 主办方**，强调结果导向而非手动控制 | 未公开定价 |

**Drawing Agent 最值得研究**：架构与 README 第 7 节推荐的 Agent 方案几乎一致，是目前公开信息中最接近「工程图→可编辑 STEP」的商业实现。

---

### 9.4 广义竞品：Text / Image → CAD

主战场在「自然语言/草图生成零件」，顺带支持工程图：

| 产品 | 官网 | 输入 | 输出 | 内核/表示 | 定价 |
|------|------|------|------|----------|------|
| **Ragnar CAD** | [ragnar.build](https://ragnar.build/) | 文本 + 图片（含工程图） | STEP/STL，B-Rep | 对话式迭代 | 免费 15 credits/月 |
| **CADAM** | [adam.new/cadam](https://adam.new/cadam) | 文本 + 图片 | STL/SCAD/DXF | OpenSCAD (WASM) | 开源 GPL-3.0 + 商业托管 |
| **AdamCAD** | [adamcad.com](https://www.adamcad.com/) | 文本 | STL/SCAD | 参数化 | $9.99–29.99/月 |
| **Nora3D** | [nora3d.ai](https://nora3d.ai/parametric-cad) | 文本 | STEP/STL/IGES/OBJ | B-Rep 实体 | 免费 30 次/月；Pro $17/月 |
| **Orville** | [ballistalabs.ai](https://www.ballistalabs.ai/) | 文本 + 图片 | STEP，制造约束感知 | B-Rep + 结构/热分析 | API 可用，定价未公开 |
| **Leo AI** | — | 文本/规格 | 装配概念 + 工程计算 | 知识驱动 | 约 $49/月起 |
| **CADGPT** | — | 对话 | CAD 脚本代码 | 脚本生成 | 免费层可用 |

**CADAM 特殊地位**：GitHub 3.9k+ stars（[Adam-CAD/CADAM](https://github.com/Adam-CAD/CADAM)），开源可自部署，但输出是 **OpenSCAD 网格化模型**而非原生 B-Rep STEP，工程精度弱于 CadQuery 路线。

---

### 9.5 传统 CAD 厂商的 AI（方向不同）

这些大厂产品**不是** 2D→3D 重建，但定义了工程师的日常工具边界：

| 厂商 | AI 能力 | 与 Hackathon 关系 |
|------|---------|------------------|
| **Autodesk Fusion** | Generative Design、Sketch AutoConstrain、**Automated Drawings（3D→2D）**、Neural CAD（2025 发布，文本/草图/图像→B-Rep） | Neural CAD 未来可能支持图像输入，但是逆向于「图纸→3D」 |
| **DraftAid** | 3D 模型 → 2D 加工图自动化 | 反向问题，说明「图纸」在工业链的核心地位 |
| **Onshape** | AI Advisor（技术问答） | 暂无生成式几何 |
| **SolidWorks** | 传统功能为主 | Backflip 等第三方插件在做 Scan→CAD |

---

### 9.6 相邻赛道：Mesh / 扫描 → CAD

不直接处理 2D 图纸，但解决类似的「legacy 数据数字化」痛点：

| 产品 | 输入 | 输出 | 定价 |
|------|------|------|------|
| [Paramesh AI](https://parameshai.com/) | STL/OBJ/PLY/3MF | STEP + Feature Tree（CadQuery 构建） | 约 $0.33/件起 |
| [Backflip AI](https://www.backflip.ai/mesh-to-cad) | 3D 扫描/mesh | STEP / Onshape 原生特征树 | Waitlist |

---

### 9.7 商业 vs 学术 vs Hackathon 对比

| 维度 | 学术论文 | Zoo.dev | Drawing Agent | Hackathon 建议 |
|------|---------|---------|---------------|---------------|
| 输入 | 合成三视图 SVG | 文本（图片在 roadmap） | PDF/DXF/图片 | PDF + DXF + 三视图 PNG |
| 方法 | 端到端训练 Transformer/VLM | KCL Agent + 自研引擎 | CadQuery Agent + VLM 对比循环 | CadQuery Agent + agentcad 沙箱 |
| 输出 | 命令序列 / Shape Program | KCL / STEP | STEP + Python 源码 | STEP + CadQuery 源码 |
| 验证 | Chamfer Distance | 引擎执行 + 截图 | 多视图 AI 对比迭代 | 同 Drawing Agent |
| 训练成本 | 高（GPU 集群） | 闭源（已训练） | 闭源（API 调用） | **零训练，纯 Agent** |
| 可演示性 | 低 | 高（有免费层） | 中（付费） | 高（自建 pipeline） |

---

### 9.8 对 WonderCAD 的定位建议

```
                    学术前沿                    商业产品                 我们的 Hackathon
                    ─────────                  ─────────                ──────────────
复杂度              Drawing2CAD                Zoo.dev                  Agent MVP
                    CReFT-CAD                  Drawing Agent
                    
输入要求            矢量 SVG                   文本为主                 图片/PDF 即可
输出                命令序列                   KCL/STEP                 CadQuery/STEP
差异化空间          发论文                     产品化/融资              工程图闭环 + 开源可复现
```

**三条可借鉴的商业经验**：

1. **Zoo**：别直接生成 B-Rep，用**代码作中间表示** + 引擎执行验证
2. **Drawing Agent**：**多视图对比迭代**是 2D→3D 商业可行性的关键，不是一次生成
3. **Theia**：复杂零件需要**人机协同**（人工复核）作为质量兜底

**不建议在 Hackathon 做的事**：
- 复刻 Zoo 的自研几何引擎或 KCL
- 与 Drawing Agent 拼 SaaS 完整度
- 追求 Paramesh 级 feature recognition（那是另一条赛道）

---

## 10. 参考文献（按时间）

### 基础

1. Wu et al. **DeepCAD: A Deep Generative Network for Computer-Aided Design Models.** ICCV 2021. [arXiv:2105.09492](https://arxiv.org/abs/2105.09492)
2. Hu et al. **PlankAssembly: Robust 3D Reconstruction from Three Orthographic Views with Learnt Shape Programs.** ICCV 2023. [arXiv:2308.05744](https://arxiv.org/abs/2308.05744)

### 2024

3. Khan et al. **Text2CAD: Generating Sequential CAD Designs from Beginner-to-Expert Level Text Prompts.** NeurIPS 2024 Spotlight. [arXiv:2409.17106](https://arxiv.org/abs/2409.17106)
4. Yavartanoo et al. **Text2CAD: Text to 3D CAD Generation via Technical Drawings.** arXiv 2024. [arXiv:2411.06206](https://arxiv.org/abs/2411.06206)

### 2025

5. Wang et al. **CAD2Program: From 2D CAD Drawings to 3D Parametric Models (A Vision-Language Approach).** AAAI 2025. [arXiv:2412.11892](https://arxiv.org/abs/2412.11892)
6. Doris et al. **CAD-Coder: An Open-Source Vision-Language Model for Computer-Aided Design Code Generation.** arXiv 2025. [arXiv:2505.14646](https://arxiv.org/abs/2505.14646)
7. Niu et al. **CReFT-CAD: Boosting Orthographic Projection Reasoning for CAD via Reinforcement Fine-Tuning.** NeurIPS 2025. [arXiv:2506.00568](https://arxiv.org/abs/2506.00568)
8. **Drawing2CAD: Sequence-to-Sequence Learning for CAD Generation from Vector Drawings.** ACM MM 2025. [arXiv:2508.18733](https://arxiv.org/abs/2508.18733)
9. **CAD-Coder: Text-to-CAD Generation with Chain-of-Thought and Geometric Reward.** NeurIPS 2025.

### 2026

10. **IterCAD: Visually-Grounded Iterative CAD Agent.** arXiv 2026. [arXiv:2606.13368](https://arxiv.org/html/2606.13368)
11. **Pro-CAD: Clarify Before You Draw.** ICML 2026. [arXiv:2602.03045](https://arxiv.org/abs/2602.03045)

### 资源索引

- [awesome-cad](https://github.com/mlightcad/awesome-cad) — 开源 CAD 生态
- [manycore-research](https://github.com/manycore-research) — PlankAssembly / CAD2Program 团队

---

## 11. 下一步（本仓库）

建议按以下顺序推进 `wondercad` 实现：

1. `scripts/smoke_cad.py` — 验证 CadQuery/build123d → STEP 链路
2. `pipeline/perceive.py` — 图纸 → Design Spec（VLM）
3. `pipeline/generate.py` — Design Spec → CadQuery 代码
4. `pipeline/verify.py` — 渲染对比 + 迭代修正
5. `app/` — 上传 Demo UI

---

*调研日期：2026-06-13（含商业化平台） | 目标：Kyrall Hackathon — Technical Drawing → 3D Part*
