import type { ReactNode } from "react";

type AgentMessageProps = {
  text: string;
  role: "user" | "assistant";
  onOpenLink: (target: string) => void;
};

const inlinePattern = /(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;

function inline(text: string, onOpenLink: (target: string) => void): ReactNode[] {
  return text.split(inlinePattern).filter(Boolean).map((part, index) => {
    if (part.startsWith("[[") && part.endsWith("]]")) {
      const [target, label] = part.slice(2, -2).split("|", 2);
      return <button className="agent-wikilink" type="button" key={index} onClick={() => onOpenLink(target)}>{label || target}</button>;
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>;
    return part;
  });
}

function isDivider(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function cells(line: string) {
  const protectedLinks: string[] = [];
  const protectedLine = line.replace(/\[\[[^\]]+\]\]/g, link => {
    protectedLinks.push(link);
    return `\u0000${protectedLinks.length - 1}\u0000`;
  });
  return protectedLine.trim().replace(/^\|/, "").replace(/\|$/, "").split("|")
    .map(cell => cell.replace(/\u0000(\d+)\u0000/g, (_, index: string) => protectedLinks[Number(index)]).trim());
}

function renderBlocks(text: string, onOpenLink: (target: string) => void, nested = false): ReactNode[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = /^\s*```(\w*)\s*$/.exec(line);
    if (fence) {
      const content: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) content.push(lines[i++]);
      if (i < lines.length) i++;
      const language = fence[1].toLowerCase();
      const isMarkdown = language === "markdown" || language === "md";
      blocks.push(<details className="agent-message-source" key={blocks.length} open={isMarkdown}>
        <summary>{isMarkdown ? "整理稿预览" : "查看代码与原文"}</summary>
        {isMarkdown ? renderBlocks(content.join("\n"), onOpenLink, true) : <pre><code>{content.join("\n")}</code></pre>}
      </details>);
      continue;
    }

    if (nested && blocks.length === 0 && line === "---") {
      const end = lines.indexOf("---", i + 1);
      const properties = lines.slice(i + 1, end);
      if (end > i + 1 && properties.every(item => !item.trim() || /^[\w-]+:\s*/.test(item) || /^\s+-\s+/.test(item))) {
        blocks.push(<details className="agent-message-properties" key={blocks.length}><summary>文档属性</summary><pre>{lines.slice(i + 1, end).join("\n")}</pre></details>);
        i = end + 1;
        continue;
      }
    }

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const content = inline(heading[2], onOpenLink);
      blocks.push(heading[1].length === 1 ? <h2 key={blocks.length}>{content}</h2> : heading[1].length === 2 ? <h3 key={blocks.length}>{content}</h3> : <h4 key={blocks.length}>{content}</h4>);
      i++;
      continue;
    }

    if (i + 1 < lines.length && line.includes("|") && isDivider(lines[i + 1])) {
      const headers = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]));
      blocks.push(<div className="agent-message-table-wrap" key={blocks.length}><table><thead><tr>{headers.map((cell, index) => <th key={index}>{inline(cell, onOpenLink)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, column) => <td key={column}>{inline(row[column] ?? "", onOpenLink)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const numbered = /^\s*\d+\.\s+/.test(line);
      const items: string[] = [];
      const marker = numbered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/;
      while (i < lines.length && marker.test(lines[i])) items.push(lines[i++].replace(marker, ""));
      const children = items.map((item, index) => <li key={index}>{inline(item, onOpenLink)}</li>);
      blocks.push(numbered ? <ol key={blocks.length}>{children}</ol> : <ul key={blocks.length}>{children}</ul>);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={blocks.length}>{quote.map((item, index) => <p key={index}>{inline(item, onOpenLink)}</p>)}</blockquote>);
      continue;
    }

    if (/^\s*---\s*$/.test(line)) { blocks.push(<hr key={blocks.length} />); i++; continue; }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*```|\s*[-*]\s|\s*\d+\.\s|>|\s*---\s*$)/.test(lines[i])) paragraph.push(lines[i++]);
    if (paragraph.length) blocks.push(<p key={blocks.length}>{inline(paragraph.join(" "), onOpenLink)}</p>);
    else i++;
  }
  return blocks;
}

export function AgentMessage({ text, role, onOpenLink }: AgentMessageProps) {
  return <article className={`agent-message agent-message-${role}`}>
    {role === "assistant" ? renderBlocks(text, onOpenLink, true) : <p>{text}</p>}
  </article>;
}
