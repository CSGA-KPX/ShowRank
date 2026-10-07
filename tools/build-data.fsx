// build-data.fsx — ShowJCR CSV → 精简 rank-data.json（userscript 本地数据源）
// 用法: dotnet fsi tools/build-data.fsx
open System
open System.IO
open System.Text

let root = __SOURCE_DIRECTORY__ |> Path.GetFullPath |> Path.GetDirectoryName  // 仓库根目录
let dataDir = Path.Combine(root, "ShowJCR-src", "中科院分区表及JCR原始数据文件")
let outDir = Path.Combine(root, "dist")
Directory.CreateDirectory(outDir) |> ignore

// ---------- CSV 解析（支持引号包裹、"" 转义；假定字段内无换行） ----------
let parseCsvLine (line: string) =
    let cells = ResizeArray<string>()
    let sb = StringBuilder()
    let mutable inQuotes = false
    let mutable i = 0
    while i < line.Length do
        let c = line[i]
        if inQuotes then
            if c = '"' then
                if i + 1 < line.Length && line[i + 1] = '"' then sb.Append('"') |> ignore; i <- i + 1
                else inQuotes <- false
            else sb.Append(c) |> ignore
        else
            match c with
            | '"' -> inQuotes <- true
            | ',' -> cells.Add(sb.ToString()); sb.Clear() |> ignore
            | _ -> sb.Append(c) |> ignore
        i <- i + 1
    cells.Add(sb.ToString())
    List.ofSeq cells

let readCsv (file: string) =
    File.ReadLines(Path.Combine(dataDir, file), Encoding.UTF8)
    |> Seq.map (fun l -> parseCsvLine (l.TrimStart('\uFEFF')))
    |> List.ofSeq

// ---------- 刊名归一化（userscript 侧必须用同一实现：仅 ASCII 字母数字） ----------
let normalize (s: string) =
    let s = s.Trim().ToUpperInvariant().Replace("&", " AND ")
    let sb = StringBuilder()
    for c in s do
        if (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') then sb.Append(c) |> ignore
        elif sb.Length > 0 && sb[sb.Length - 1] <> ' ' then sb.Append(' ') |> ignore
    sb.ToString().Trim()

// ---------- 值提取 ----------
let firstChar (s: string) = if String.IsNullOrWhiteSpace s then "" else string s[0]

let fqbQu (s: string) =   // "3 [168/495]" -> "3"
    firstChar s

let xrQu (s: string) =    // "4 区" -> "4"
    firstChar s

let yesNo (s: string) =   // "是"/"否" -> "1"/""
    if s.Trim() = "是" then "1" else ""

let xrTop (s: string) =   // "—" -> ""
    if s.Trim() = "—" || String.IsNullOrWhiteSpace s then "" else "1"

let firstQuartile (cells: string list) (idx: int list) =  // 多学科取第一个非空 Quartile
    idx |> List.tryPick (fun i -> if i < cells.Length && not (String.IsNullOrWhiteSpace cells[i]) then Some(cells[i].Trim()) else None)
    |> Option.defaultValue ""

// ---------- 行模型：7 槽位 ----------
// 0:中科院大类分区 1:中科院Top 2:JCR IF 3:JCR Quartile 4:新锐大类分区 5:新锐Top 6:新锐预警
let emptyRow () = [| ""; ""; ""; ""; ""; ""; "" |]

let journals = System.Collections.Generic.Dictionary<string, string[]>()
let getRow (name: string) =
    let key = normalize name
    match journals.TryGetValue key with
    | true, r -> key, r
    | _ -> let r = emptyRow () in journals[key] <- r; key, r

// FQBJCR2025: Journal,年份,ISSN/EISSN,Review,OAJ,Open Access,Web of Science,标注,大类,大类分区,Top,...
let fqb = readCsv "FQBJCR2025-UTF8.csv"
for cells in fqb.Tail do
    if cells.Length >= 11 && not (String.IsNullOrWhiteSpace cells[0]) then
        let _, r = getRow cells[0]
        if r[0] = "" then
            r[0] <- fqbQu cells[9]
            r[1] <- yesNo cells[10]

// JCR2025: Journal,ISSN,EISSN,Web of Science,IF(2025),Category_1,Q_1,Rank_1,...,Category_6,Q_6,Rank_6
let jcr = readCsv "JCR2025-UTF8.csv"
for cells in jcr.Tail do
    if cells.Length >= 7 && not (String.IsNullOrWhiteSpace cells[0]) then
        let _, r = getRow cells[0]
        if r[2] = "" then
            r[2] <- cells[4].Trim()
            r[3] <- firstQuartile cells [6; 9; 12; 15; 18; 21]

// XR2026: Journal,年份,预警标记,刊名,中文刊名,CN,ISSN,EISSN,出版机构,语种,期刊类型,数据库,标注,
//         大类英文名,大类中文名,大类新锐分区,Top,...
let xr = readCsv "XR2026-UTF8.csv"
for cells in xr.Tail do
    if cells.Length >= 17 && not (String.IsNullOrWhiteSpace cells[0]) then
        let _, r = getRow cells[0]
        if r[4] = "" then
            r[4] <- xrQu cells[15]
            r[5] <- xrTop cells[16]
            r[6] <- cells[2].Trim()   // 预警标记（如 "Under Review"）

// ---------- NLM 期刊目录（PubMed 缩写→全称，jourcache.xml） ----------
open System.Xml

// 解析 jourcache.xml，返回 (Name, [MedAbbr; IsoAbbr; Alias...]) 序列
let parseJourCache (path: string) =
    let result = ResizeArray<string * ResizeArray<string>>()
    let settings = XmlReaderSettings(DtdProcessing = DtdProcessing.Parse, XmlResolver = null)
    use r = XmlReader.Create(path, settings)
    let mutable inJournal = false
    let mutable curName = ""
    let mutable curAbbrs = ResizeArray<string>()
    while r.Read() do
        if r.NodeType = XmlNodeType.Element then
            match r.Name with
            | "Journal" -> inJournal <- true; curName <- ""; curAbbrs <- ResizeArray<string>()
            | "Name" when inJournal -> curName <- r.ReadElementContentAsString()
            | ("MedAbbr" | "IsoAbbr" | "Alias") when inJournal -> curAbbrs.Add(r.ReadElementContentAsString())
            | _ -> ()
        elif r.NodeType = XmlNodeType.EndElement && r.Name = "Journal" && inJournal then
            result.Add(curName, curAbbrs)
            inJournal <- false
    result

// NLM Name 常带 "The" 前缀、" : 副标题"或 "(地名)" 后缀，JCR/FQBJCR 只有主名
let nameVariants (name: string) =
    seq {
        let main = name.Split([| " : " |], StringSplitOptions.None)[0]
        yield main.Trim()
        let noParen = Text.RegularExpressions.Regex.Replace(name, @"\s*\([^)]*\)", "").Trim()
        if noParen <> main then yield noParen
        if name <> main && name <> noParen then yield name
    }

// 依次尝试：主名截断版 → 去括号后缀版 → 原名 → 较长 Alias，命中即作为主键
let resolveKeyAny (candidates: seq<string>) =
    candidates
    |> Seq.choose (fun raw ->
        let k = normalize raw
        if journals.ContainsKey k then Some k
        elif k.StartsWith("THE ") && journals.ContainsKey(k.Substring(4)) then Some(k.Substring(4))
        else None)
    |> Seq.tryHead

let aliases = System.Collections.Generic.Dictionary<string, string>()
let mutable aliasConflicts = 0
let addAlias (abbrRaw: string) (target: string) =
    let k = normalize abbrRaw
    if k <> "" && k <> target then
        match aliases.TryGetValue k with
        | true, existing when existing <> target -> aliasConflicts <- aliasConflicts + 1  // 歧义缩写，保守丢弃
        | true, _ -> ()
        | _ -> aliases[k] <- target

let nlm = parseJourCache (Path.Combine(root, "Pubmed", "jourcache.xml"))
let mutable nlmMatched = 0
for name, abbrs in nlm do
    let candidates =
        seq {
            yield! nameVariants name
            for a in abbrs do
                if a.Length > 10 then yield a   // 短缩写不做主名候选
        }
    match resolveKeyAny candidates with
    | Some target ->
        nlmMatched <- nlmMatched + 1
        // 全名各变体（带副标题/括号后缀的 NLM 原名）也注册为别名，方便详情页全名命中
        for v in nameVariants name do addAlias v target
        for a in Seq.distinct abbrs do addAlias a target
    | None -> ()

// ---------- 输出 JSON ----------
let esc (s: string) =   // 值里理论上无特殊字符，保险起见仍转义
    s.Replace("\\", "\\\\").Replace("\"", "\\\"")

let sbJson = StringBuilder()
sbJson.Append("{\n  \"version\": \"2025.1\",\n") |> ignore
sbJson.Append("  \"generated\": \"" + DateTime.Now.ToString("yyyy-MM-dd") + "\",\n") |> ignore
sbJson.Append("  \"fields\": [\"fqbQu\",\"fqbTop\",\"jcrIF\",\"jcrQu\",\"xrQu\",\"xrTop\",\"xrWarn\"],\n") |> ignore
sbJson.Append("  \"journals\": {\n") |> ignore
let keys = journals.Keys |> Seq.sort |> List.ofSeq
keys
|> List.iteri (fun i k ->
    let r = journals[k]
    let line = sprintf "    \"%s\": [\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\",\"%s\"]%s\n"
                k (esc r[0]) (esc r[1]) (esc r[2]) (esc r[3]) (esc r[4]) (esc r[5]) (esc r[6])
                (if i < keys.Length - 1 then "," else "")
    sbJson.Append(line) |> ignore)
sbJson.Append("  },\n  \"alias\": {\n") |> ignore
let aliasKeys = aliases.Keys |> Seq.sort |> List.ofSeq
aliasKeys
|> List.iteri (fun i k ->
    let line = sprintf "    \"%s\": \"%s\"%s\n" (esc k) (esc aliases[k]) (if i < aliasKeys.Length - 1 then "," else "")
    sbJson.Append(line) |> ignore)
sbJson.Append("  }\n}\n") |> ignore

let outPath = Path.Combine(outDir, "rank-data.json")
File.WriteAllText(outPath, sbJson.ToString(), UTF8Encoding(false))

// ---------- 统计 ----------
let has idx = keys |> List.filter (fun k -> journals[k][idx] <> "") |> List.length
printfn "== 数据管线完成 =="
printfn "输出: %s (%.2f MB)" outPath (float (FileInfo(outPath).Length) / 1048576.0)
printfn "期刊总数(归一化键): %d" keys.Length
printfn "含中科院分区: %d" (has 0)
printfn "含 JCR IF: %d" (has 2)
printfn "含新锐分区: %d" (has 4)
printfn "含预警标记: %d" (has 6)
printfn "NLM 目录命中: %d / %d" nlmMatched nlm.Count
printfn "缩写/别名映射: %d 条 (冲突丢弃 %d)" aliasKeys.Length aliasConflicts
