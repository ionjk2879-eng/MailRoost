import { AlignCenter, AlignLeft, AlignRight, Bold, Eraser, Image, IndentIncrease, Italic, Link, List, ListOrdered, Outdent, Redo2, Strikethrough, Underline, Undo2 } from "lucide-react"
import { useEffect, useRef } from "react"

interface RichTextEditorProps { value: string; onChange: (html: string) => void }

export function RichTextEditor({ value, onChange }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value }, [value])
  const command = (name: string, commandValue?: string) => {
    editorRef.current?.focus()
    document.execCommand(name, false, commandValue)
    onChange(editorRef.current?.innerHTML ?? "")
  }
  const tools = [
    [Undo2, "undo", "실행 취소"], [Redo2, "redo", "다시 실행"], [Bold, "bold", "굵게"], [Italic, "italic", "기울임"],
    [Underline, "underline", "밑줄"], [Strikethrough, "strikeThrough", "취소선"], [AlignLeft, "justifyLeft", "왼쪽 정렬"],
    [AlignCenter, "justifyCenter", "가운데 정렬"], [AlignRight, "justifyRight", "오른쪽 정렬"], [List, "insertUnorderedList", "글머리 기호"],
    [ListOrdered, "insertOrderedList", "번호 목록"], [Outdent, "outdent", "내어쓰기"], [IndentIncrease, "indent", "들여쓰기"], [Eraser, "removeFormat", "서식 제거"],
  ] as const
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex flex-wrap items-center gap-1 border-t border-b bg-muted/20 px-3 py-2">
      <select aria-label="글자 크기" defaultValue="3" onChange={(e) => command("fontSize", e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs"><option value="2">12px</option><option value="3">14px</option><option value="4">16px</option><option value="5">20px</option><option value="6">24px</option></select>
      <input type="color" aria-label="글자색" className="h-8 w-8 cursor-pointer rounded border bg-background p-1" onChange={(e) => command("foreColor", e.target.value)} />
      {tools.map(([Icon, name, label]) => <button key={name} type="button" title={label} aria-label={label} onMouseDown={(e) => { e.preventDefault(); command(name) }} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"><Icon className="size-4" /></button>)}
      <button type="button" title="링크 삽입" onMouseDown={(e) => { e.preventDefault(); const url = window.prompt("링크 주소를 입력하세요", "https://"); if (url) command("createLink", url) }} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background"><Link className="size-4" /></button>
      <button type="button" title="이미지 삽입" onMouseDown={(e) => { e.preventDefault(); const url = window.prompt("이미지 주소를 입력하세요", "https://"); if (url) command("insertImage", url) }} className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background"><Image className="size-4" /></button>
    </div>
    <div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" data-placeholder="메일 내용을 입력하세요..." onInput={(e) => onChange(e.currentTarget.innerHTML)} className="rich-mail-editor min-h-[260px] flex-1 overflow-y-auto px-5 py-4 text-[15px] leading-7 outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]" />
  </div>
}
