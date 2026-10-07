# verify.ps1 — dist/show-rank.user.js 静态验证
# 用法: pwsh tools/verify.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$raw = [IO.File]::ReadAllText((Join-Path $root 'dist\show-rank.user.js'), [Text.Encoding]::UTF8)

# 1) 数据段可解析
$m = [regex]::Match($raw, '/\*__DATA__\*/(.*)/\*__DATA__\*/', 'Singleline')
if (-not $m.Success) { throw '未找到数据段' }
$data = $m.Groups[1].Value | ConvertFrom-Json
"数据段解析 OK: version=$($data.version)"

# 2) 键规范化自检（模拟 JS normalize）
function Normalize-Js([string]$s) {
  $s = $s.Trim().ToUpperInvariant().Replace('&',' AND ')
  $s = [regex]::Replace($s, '[^A-Z0-9]+', ' ')
  return $s.Trim()
}
$bad = 0
foreach ($p in $data.journals.PSObject.Properties) {
  if ((Normalize-Js $p.Name) -cne $p.Name) { $bad++ }
}
if ($bad -gt 0) { throw "键规范化异常 $bad 个" }
"键规范化检查 OK: $($data.journals.PSObject.Properties.Count) 个"

# 3) 原始 CSV 刊名对拍（JCR2025 前 500 行）
$csv = [IO.File]::ReadLines((Join-Path $root 'ShowJCR-src\中科院分区表及JCR原始数据文件\JCR2025-UTF8.csv'), [Text.Encoding]::UTF8) | Select-Object -Skip 1 | Select-Object -First 500
$miss = 0
foreach ($line in $csv) {
  $name = ($line -split ',')[0].Trim('"')
  $k = Normalize-Js $name
  if (-not $data.journals.PSObject.Properties[$k]) { $miss++ }
}
if ($miss -gt 0) { throw "CSV 对拍未命中 $miss / $($csv.Count)" }
"CSV 对拍 OK: $($csv.Count) 个全部命中"

# 4) 模板段括号配平 + 元数据块
$tpl = $raw.Remove($m.Index, $m.Length)
$tpl = [regex]::Replace($tpl, '(?s)//[^\r\n]*|/\*.*?\*/', '')
$tpl = [regex]::Replace($tpl, "'(?:[^'\\]|\\.)*'", "''")
$tpl = [regex]::Replace($tpl, '"(?:[^"\\]|\\.)*"', '""')
foreach ($pair in @(@('{','}'),@('(',')'),@('[',']'))) {
  $o = ([regex]::Matches($tpl,[regex]::Escape($pair[0]))).Count
  $c = ([regex]::Matches($tpl,[regex]::Escape($pair[1]))).Count
  if ($o -ne $c) { throw "括号不配平: $($pair[0])$($pair[1]) $o/$c" }
}
if ($raw -notmatch '(?s)// ==UserScript==.*?// ==/UserScript==') { throw '元数据块缺失' }
'模板括号配平 OK, 元数据块 OK'
'== 全部验证通过 =='
