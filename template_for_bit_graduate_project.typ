//template_for_bit_graduate_project.typ

// 定义 project 函数，接收 title, authors, date 和 body 参数
#let project(
  title: "",
  authors: (),
  date: none,
  body
) = {
  // 1. 设置文档元数据
  set document(author: authors, title: title)

  // 2. 设置页面参数
  set page(
    paper: "a4",
    margin: (left: 30mm, right: 26mm, top: 35mm, bottom: 26mm),
    
    // 页眉
    // 内容：“北京理工大学本科生毕业设计（论文）”，宋体、四号(14pt)、居中、字间距0.5pt
    // 位置：距离顶部 2.4cm。margin.top 是 3.5cm，所以页眉在 margin 区域内。
    // 我们使用 block + v 对齐调整来模拟视觉位置。
    header: {
      set text(font: "SimSun", size: 14pt, tracking: 0.5pt)
      set align(center)
      // 下移页眉使其视觉重心接近 2.4cm 处 (需要根据实际打印效果微调)
      // 这里直接放置并添加下划线
      block(width: 100%, inset: (bottom: 5pt), stroke: (bottom: 0.5pt))[
        北京理工大学本科生毕业设计（论文）
      ]
    },

    // 页脚
    // 内容：页码，宋体、五号(10.5pt)、居中
    // 位置：距离底部 2cm
    footer: {
      set text(font: "SimSun", size: 10.5pt)
      set align(center)
      context counter(page).display("1")
    },
  )

  // 3. 全局字体和段落格式
  // 正文：宋体、小四(12pt)
  // 行距：22磅 (固定行高 22pt -> loading = 22pt - 12pt = 10pt)
  set text(font: ("SimSun", "Times New Roman"), lang: "zh", size: 12pt)
  set par(
    leading: 10pt, // 行间距
    justify: true, // 两端对齐
    first-line-indent: 2em // 首行缩进
  )

  // 4. 标题格式设置
  // 标题行距：1.5倍 (leading = 0.5em)
  
  // 设置标题编号模式
  set heading(numbering: (..nums) => {
    let nums = nums.pos()
    if nums.len() == 1 {
      "第" + str(nums.first()) + "章"
    } else {
      nums.map(str).join(".")
    }
  })

  // 统一的标题样式展示规则 (替代默认行为和零散规则)
  show heading: it => {
    // 基础字体设置
    set text(font: "SimHei", weight: "bold", tracking: 0pt) // 恢复默认字间距
    set par(leading: 0.5em, first-line-indent: 0pt) // 标题不缩进
    
    // 如果是一级标题，重置公式编号
    if it.level == 1 {
      counter(math.equation).update(0)
    }

    // 根据层级设置不同的属性
    let (font-size, spacing-above, spacing-below, alignment) = if it.level == 1 {
      (16pt, 0.5em, 1em, center)  // 一级：三号，段前0.5行，段后1行，居中
    } else if it.level == 2 {
      (14pt, 0.5em, 0em, left)    // 二级：四号，段前0.5行，段后0行，左对齐
    } else {
      (12pt, 0.5em, 0em, left)    // 三级：小四，段前0.5行，段后0行，左对齐
    }
    
    set text(size: font-size)
    set align(alignment) 

    // 构造最终的标题块
    block(
      above: spacing-above, 
      below: spacing-below + 0.75em, // 额外补偿一点行高带来的视觉差异，确保足够空隙
      sticky: true,
      it
    )
  }

  // 目录设置 (Level 1 左对齐，其他缩进)
  show outline.entry: it => {
    // 仅针对标题类型的目录项
    if it.element.func() == heading {
      let indent = (it.level - 1) * 2em // 每一级缩进 2em
      // 可以在这里设置字体，比如一级标题加粗
      let font-weight = if it.level == 1 { "bold" } else { "regular" }
      
      // 构造目录行： 缩进 + 链接(内容 + 填充 + 页码)
      h(indent)
      link(it.element.location(), it.indented(
        it.prefix(), 
        it.body() + box(width: 1fr, repeat[.]) + str(it.page()) // 简单的点线引导
      ))
    } else {
      it
    }
  }
  // 简易目录设置: 如果不想完全重写 outline.entry，可以使用 set outline(indent: 2em)
  // 但上述要求 "一级左对齐，下级缩进"，默认 auto indent 可能符合，也可能需要强制。
  // 我们这里使用 set outline 来简化，若需复杂定制可解除上方注释。
  set outline(indent: 1em) // 开启自动缩进，1em 表示缩进一个汉字宽度

  // 5. 图、表标号与格式
  // 编号格式：按章依序 (1-1, 1-2)
  set figure(numbering: "1-1")

  // 全局图表样式
  show figure: it => {
    set align(center)
    set text(font: "SimSun", size: 10.5pt) // 宋体，五号
    
    // 图表与上下文之间各空一行 (正文行距 22pt)
    block(above: 22pt, below: 22pt, it)
  }

  // 图像特定设置：图注在下 (默认)，前缀 "图"
  show figure.where(kind: image): set figure(supplement: "图")
  
  // 表格特定设置：表头在上，前缀 "表"
  show figure.where(kind: table): set figure(supplement: "表")
  show figure.where(kind: table): set figure.caption(position: top)

  // 修正 caption 的字体样式 (确保 caption 也是宋体五号，且不加粗)
  show figure.caption: set text(font: "SimSun", size: 10.5pt, weight: "regular")
  
  // 6. 数学公式设置
  // 编号格式：按章依序 (1-1)。使用 numbering 函数，传入当前章节和公式计数。
  set math.equation(numbering: (..nums) => {
    // 自动通过 numbering 获取章节号和公式序号
    // Typst 默认的 numbering "1.1" 行为已经足够智能，但如果要括号包围，需自定义
    let all = nums.pos()
    // 获取当前的一级标题序号作为第一部分
    let chapter = counter(heading).get().first()
    let eq-num = all.last()
    "(" + str(chapter) + "-" + str(eq-num) + ")"
  })

  // 引用格式：显示为 "式(1-1)"
  // 注意：Typst 的引用默认只显示 numbering 的结果，即 "(1-1)"
  // 要添加 "式" 前缀，可以通过 show ref 规则，但这会影响所有引用。
  // 更好的做法是在写引用时手动加 "式" 或定义特定补充规则。
  // 这里演示一种针对 equation 的引用增强：
  show ref: it => {
    let el = it.element
    if el != none and el.func() == math.equation {
      // 链接到公式，内容为 "式" + 编号
      link(el.location(), "式" + numbering(
        el.numbering, 
        ..counter(heading).at(el.location()), // 获取公式所在处的章节
        counter(math.equation).at(el.location()).first() // 获取公式序号
      ))
    } else {
      it
    }
  }
  


  // 7. 封面标题部分   (保持原样或根据需要调整)
  if title != "" {
    align(center)[
      #block(text(font: "SimHei", weight: "bold", size: 20pt, title)) // 假设封面标题更大
      #v(2em)
      #if date != none {
        text(size: 14pt, date)
      }
    ]
    pagebreak() // 封面后通常换页
  }
  
  // 重置页码 (如果封面不要页码)
  counter(page).update(1)

  // 7. 参考文献设置 (GB/T 7714-2015)
  // 使用方法：在文档末尾调用bibliography("参考文献.bib", style: "china-national-standard-gb-t-7714-2015-numeric.csl")
  // 但为了简化，我们可以在这里定义 bibliography 的默认样式
  set bibliography(style: "china-national-standard-gb-t-7714-2015-numeric.csl", title: text(font: "SimHei", weight: "bold", size: 16pt)[参考文献])

  // 渲染正文
  body
}

// 附录配置函数
// 使用方法：在参考文献之后，调用 #show: appendix
#let appendix(body) = {
  // 重置计数器
  counter(heading).update(0)
  counter(figure).update(0) 
  
  // 设置标题编号为 附录A, 附录B
  set heading(numbering: (..nums) => {
    let nums = nums.pos()
    if nums.len() == 1 {
      "附录" + numbering("A", nums.first())
    } else {
      numbering("A.1", ..nums)
    }
  })

  // 更新图表和公式的编号前缀
  // 注意：Typst 的计数器是全局的，这里我们需要修改编号逻辑让其包含附录章节
  
  // 图表编号：A-1
  set figure(numbering: (..nums) => {
    let chapter = numbering("A", counter(heading).get().first())
    let fig-num = nums.pos().last()
    chapter + "-" + str(fig-num)
  })

  // 公式编号：A-1
  set math.equation(numbering: (..nums) => {
    let chapter = numbering("A", counter(heading).get().first())
    let eq-num = nums.pos().last()
    "(" + chapter + "-" + str(eq-num) + ")"
  })
  
  // 重置一级标题的自动计数重置逻辑 (因为 heading 规则里写死是数字重置，这里需要覆盖或者兼容)
  // 在 template 的 heading 规则中，我们写了 if level==1 { counter(math).update(0) }
  // 这部分逻辑依然通用，只要 counter(heading) 能够在附录中正常递增即可。

  body
}