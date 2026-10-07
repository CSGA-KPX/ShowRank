# build-userscript.ps1 — 把 rank-data.json 注入模板，生成 dist/show-rank.user.js
# 用法: pwsh tools/build-userscript.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$template = [IO.File]::ReadAllText((Join-Path $root 'userscript\template.user.js'), [Text.Encoding]::UTF8)
$json = [IO.File]::ReadAllText((Join-Path $root 'dist\rank-data.json'), [Text.Encoding]::UTF8).Trim()

$placeholder = '/*__DATA__*/null/*__DATA__*/'
if (-not $template.Contains($placeholder)) { throw '模板中未找到数据占位符' }

$out = $template.Replace($placeholder, '/*__DATA__*/' + $json + '/*__DATA__*/')
$outPath = Join-Path $root 'dist\show-rank.user.js'
[IO.File]::WriteAllText($outPath, $out, [Text.UTF8Encoding]::new($false))

"生成: $outPath ($([math]::Round((Get-Item $outPath).Length/1MB, 2)) MB)"
if ($out.Contains('/*__DATA__*/null')) { throw '数据注入失败' }
'数据注入成功'
