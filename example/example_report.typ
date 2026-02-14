#import "../template_for_bit_graduate_project.typ": project

#show: project.with(
  title: "北京理工大学毕业设计排版测试",
  authors: ("张三",),
  date: "2026年2月14日",
)

= 第一章 绪论

这是第一章的第一段文字。根据修改后的模板设置，这段文字应该有两个字符的首行缩进。Typst 默认在标题后的首段不缩进，但我们通过插入隐形块的方式强制开启了缩进。@vaswani2017attention

这是第一章的第二段文字。作为后续段落，它本来就会有缩进。我们需要确认所有段落的缩进是否一致。

== 研究背景

这是二级标题下的第一段文字。同样，这段文字也必须有两个字符的缩进。

=== 具体背景

这是三级标题下的第一段文字。测试三级标题后的缩进情况。

= 第二章 关键技术

这是第二章的第一段文字。再次确认一级标题后的首段缩进是否正常工作。

在此处插入一个公式，测试公式编号是否正常：
$ E = m c^2 $

在此处插入一个图表引用 @fig:test，测试图表编号。

#figure(
  rect[这是一个示意图],
  caption: "测试图片",
) <fig:test>

在此处插入一个表格引用 @tbl:test，测试表格编号。@knuth1984texbook

#figure(
  table(
    columns: (auto, auto),
    [列1], [列2],
    [数据A], [数据B],
  ),
  caption: "测试表格",
) <tbl:test>

== 实验结果

这是实验结果章节的第一段。

#bibliography("ref.bib")
