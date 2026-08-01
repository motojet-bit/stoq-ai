//! SEC の提出書類（HTML）を LLM に渡せるプレーンテキストへ変換する。
//!
//! 外部クレートに依存しない軽量な実装。10-K は数 MB になるため、
//! タグ除去と空白の圧縮だけを 1 パスで行う。

/// HTML からテキストを抽出する。`<script>` / `<style>` の中身は捨てる。
pub fn to_text(html: &str) -> String {
    let bytes: Vec<char> = html.chars().collect();
    let mut out = String::with_capacity(html.len() / 3);
    let mut i = 0usize;

    while i < bytes.len() {
        if bytes[i] == '<' {
            let tag_name = read_tag_name(&bytes, i);

            // script / style はブロックごと読み飛ばす
            if tag_name == "script" || tag_name == "style" {
                if let Some(end) = find_closing(&bytes, i, &tag_name) {
                    i = end;
                    continue;
                }
            }

            // ブロック要素の終わりは改行として扱う
            if is_block_tag(&tag_name) && !out.ends_with('\n') {
                out.push('\n');
            } else if !out.ends_with(' ') && !out.ends_with('\n') && !ends_with_cjk(&out) {
                // インライン要素（<b> など）は英文の単語区切りとして空白を入れる。
                // ただし日本語の直後には入れない（「売上高は 512億 ドル」になってしまう）
                out.push(' ');
            }

            match bytes[i..].iter().position(|c| *c == '>') {
                Some(offset) => i += offset + 1,
                None => break,
            }
            continue;
        }

        if bytes[i] == '&' {
            if let Some((decoded, consumed)) = read_entity(&bytes, i) {
                out.push_str(&decoded);
                i += consumed;
                continue;
            }
        }

        let ch = bytes[i];
        if ch.is_whitespace() || ch == '\u{a0}' {
            if !out.ends_with(' ') && !out.ends_with('\n') {
                out.push(' ');
            }
        } else {
            out.push(ch);
        }
        i += 1;
    }

    collapse_blank_lines(&out)
}

/// 末尾が CJK 文字か。日本語の途中に空白を入れないための判定。
fn ends_with_cjk(text: &str) -> bool {
    text.chars().next_back().is_some_and(|c| {
        matches!(c as u32,
            0x3000..=0x30FF | 0x3400..=0x4DBF | 0x4E00..=0x9FFF
            | 0xAC00..=0xD7AF | 0xF900..=0xFAFF | 0xFF00..=0xFFEF)
    })
}

fn read_tag_name(chars: &[char], start: usize) -> String {
    let mut i = start + 1;
    if i < chars.len() && chars[i] == '/' {
        i += 1;
    }
    let mut name = String::new();
    while i < chars.len() && (chars[i].is_ascii_alphanumeric()) {
        name.push(chars[i].to_ascii_lowercase());
        i += 1;
    }
    name
}

fn find_closing(chars: &[char], start: usize, tag: &str) -> Option<usize> {
    let needle: Vec<char> = format!("</{tag}").chars().collect();
    let mut i = start + 1;
    while i + needle.len() <= chars.len() {
        let matches = needle
            .iter()
            .enumerate()
            .all(|(k, c)| chars[i + k].to_ascii_lowercase() == *c);
        if matches {
            // '>' の次まで進める
            let mut j = i + needle.len();
            while j < chars.len() && chars[j] != '>' {
                j += 1;
            }
            return Some((j + 1).min(chars.len()));
        }
        i += 1;
    }
    None
}

fn is_block_tag(tag: &str) -> bool {
    matches!(
        tag,
        "p" | "div"
            | "br"
            | "tr"
            | "table"
            | "li"
            | "ul"
            | "ol"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "section"
            | "article"
            | "header"
            | "footer"
            | "hr"
    )
}

/// `&amp;` などを復号する。戻り値は (復号後の文字列, 消費した文字数)。
fn read_entity(chars: &[char], start: usize) -> Option<(String, usize)> {
    let limit = (start + 12).min(chars.len());
    let semi = (start + 1..limit).find(|k| chars[*k] == ';')?;
    let name: String = chars[start + 1..semi].iter().collect();

    let decoded = match name.as_str() {
        "amp" => "&".to_string(),
        "lt" => "<".to_string(),
        "gt" => ">".to_string(),
        "quot" => "\"".to_string(),
        "apos" | "#39" => "'".to_string(),
        "nbsp" | "#160" => " ".to_string(),
        "mdash" | "#8212" => "—".to_string(),
        "ndash" | "#8211" => "–".to_string(),
        "rsquo" | "#8217" => "'".to_string(),
        "lsquo" | "#8216" => "'".to_string(),
        "ldquo" | "#8220" => "\"".to_string(),
        "rdquo" | "#8221" => "\"".to_string(),
        other => {
            // 数値文字参照
            let num = other.strip_prefix('#')?;
            let code = if let Some(hex) = num.strip_prefix('x').or_else(|| num.strip_prefix('X')) {
                u32::from_str_radix(hex, 16).ok()?
            } else {
                num.parse::<u32>().ok()?
            };
            char::from_u32(code)?.to_string()
        }
    };

    Some((decoded, semi - start + 1))
}

fn collapse_blank_lines(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank_run = 0usize;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
            out.push('\n');
        } else {
            blank_run = 0;
            out.push_str(trimmed);
            out.push('\n');
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn タグを除去して本文だけ残す() {
        let text = to_text("<p>売上高は<b>512億</b>ドル</p>");
        assert!(text.contains("売上高は512億ドル"), "{text}");
    }

    #[test]
    fn スクリプトとスタイルは捨てる() {
        let text = to_text("<style>p{color:red}</style><script>alert(1)</script><p>本文</p>");
        assert!(!text.contains("color"));
        assert!(!text.contains("alert"));
        assert!(text.contains("本文"));
    }

    #[test]
    fn 実体参照を復号する() {
        let text = to_text("<p>A &amp; B &lt;C&gt; &#39;D&#39; &nbsp;E</p>");
        assert!(text.contains("A & B <C> 'D'"), "{text}");
    }

    #[test]
    fn 空文字でも落ちない() {
        assert_eq!(to_text(""), "");
    }

    #[test]
    fn 閉じていないタグでも落ちない() {
        let _ = to_text("<p>途中で切れた<div class=");
    }
}
