# Builds the offline "local edition": one HTML file that runs by double-click (file://), no server, no internet.
# Same source as the web version: ES modules are wrapped into a tiny module registry, CSS and sample HWPX are inlined,
# Supabase config is emptied so data stays in this PC's browser (localStorage).
# Usage: powershell -ExecutionPolicy Bypass -File tools\build-local.ps1
# ASCII-only script for Windows PowerShell 5.1; Korean names are built from code points.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$enc = New-Object System.Text.UTF8Encoding($false)
function K([int[]]$cp) { -join ($cp | ForEach-Object { [char]$_ }) }
$outDirName = (K 0xB85C,0xCEEC,0xD310)            # local edition folder name
$htmlName = 'kookbang-eum-plus.html'
$outDir = Join-Path $root $outDirName
$sampleDirName = (K 0xC0D8,0xD50C) + 'HWPX'          # sample folder name
New-Item -ItemType Directory -Force $outDir | Out-Null

function Resolve-Spec([string]$fromKey, [string]$spec) {
  $parts = New-Object System.Collections.Generic.List[string]
  ($fromKey -split '/') | Select-Object -SkipLast 1 | ForEach-Object { $parts.Add($_) }
  foreach ($p in ($spec -split '/')) {
    if ($p -eq '.' -or $p -eq '') { continue }
    if ($p -eq '..') { $parts.RemoveAt($parts.Count - 1); continue }
    $parts.Add($p)
  }
  return ($parts -join '/')
}

$jsFiles = Get-ChildItem (Join-Path $root 'js') -Recurse -Filter *.js | Sort-Object FullName
$modules = New-Object System.Text.StringBuilder
foreach ($f in $jsFiles) {
  $key = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
  $src = [IO.File]::ReadAllText($f.FullName, $enc)
  if ($key -eq 'js/config.js') { $src = "export const CONFIG = { supabaseUrl: '', supabaseAnonKey: '' };`n" }
  $exports = New-Object System.Collections.Generic.List[string]
  # import { a, b } from './x.js';  ->  const { a, b } = __req('js/x.js');
  $src = [regex]::Replace($src, "(?ms)^import\s*\{(.*?)\}\s*from\s*'([^']+)';", {
    param($m)
    $names = ($m.Groups[1].Value -replace '\s+', ' ').Trim().TrimEnd(',')
    "const { $names } = __req('" + (Resolve-Spec $key $m.Groups[2].Value) + "');"
  })
  # await import('./x.js')  ->  __req('js/x.js')
  $src = [regex]::Replace($src, "import\('([^']+)'\)", { param($m) "__req('" + (Resolve-Spec $key $m.Groups[1].Value) + "')" })
  # export { a, b };
  $src = [regex]::Replace($src, "(?m)^export\s*\{([^}]*)\};?\s*$", {
    param($m)
    $m.Groups[1].Value.Split(',') | ForEach-Object { $n = $_.Trim(); if ($n) { $exports.Add($n) } }
    ''
  })
  # export function / async function / const / class
  $src = [regex]::Replace($src, "(?m)^export\s+((?:async\s+)?function\*?|const|class)\s+([A-Za-z_$][\w$]*)", {
    param($m)
    $exports.Add($m.Groups[2].Value)
    $m.Groups[1].Value + ' ' + $m.Groups[2].Value
  })
  if ($src -match '(?m)^\s*(import|export)\s') { throw "unconverted import/export left in $key" }
  $ret = ($exports | Select-Object -Unique | ForEach-Object { $_ }) -join ', '
  [void]$modules.Append("__def('$key', function () {`n$src`nreturn { $ret };`n});`n")
}

# sample HWPX files, embedded as base64 for [sample reset]
$sampleDir = Join-Path $root 'samples\hwpx'
$samples = @{}
Get-ChildItem $sampleDir -Filter *.hwpx | ForEach-Object {
  $fs = [IO.File]::Open($_.FullName, 'Open', 'Read', 'ReadWrite'); $ms = New-Object IO.MemoryStream; $fs.CopyTo($ms); $fs.Close()
  $samples[$_.Name] = [Convert]::ToBase64String($ms.ToArray())
}
$samplesJson = ($samples.GetEnumerator() | Sort-Object Name | ForEach-Object { '"' + $_.Name + '":"' + $_.Value + '"' }) -join ','

$loader = @'
globalThis.__LOCAL_BUILD__ = true;
const __mods = {}, __cache = {};
function __def(k, f) { __mods[k] = f; }
function __req(k) { if (k in __cache) return __cache[k]; if (!__mods[k]) throw new Error('module not found: ' + k); __cache[k] = {}; const ex = __mods[k](); __cache[k] = ex; return ex; }
globalThis.__req = __req; // 점검용 (개발자 도구 콘솔에서 __req('js/core.js') 등)
'@
$js = $loader + "`nglobalThis.__SAMPLES__ = {$samplesJson};`n" + $modules.ToString() + "__req('js/main.js');`n"
$js = $js.Replace('</script', '<\/script')
$css = [IO.File]::ReadAllText((Join-Path $root 'css\app.css'), $enc)

$html = [IO.File]::ReadAllText((Join-Path $root 'index.html'), $enc)
$html = $html.Replace('<link rel="stylesheet" href="css/app.css">', "<style>`n$css`n</style>")
$html = $html.Replace('<script type="module" src="js/main.js"></script>', "<script>`n(() => {`n$js`n})();`n</script>")
$html = $html.Replace('<title>', '<title>' + (K 0xB85C,0xCEEC,0xD310) + ' | ')
if ($html -notmatch '__LOCAL_BUILD__') { throw 'index.html placeholders not found' }
[IO.File]::WriteAllText((Join-Path $outDir $htmlName), $html, $enc)

# copy sample HWPX so they can be imported by hand on the target PC
$sd = Join-Path $outDir $sampleDirName
New-Item -ItemType Directory -Force $sd | Out-Null
Get-ChildItem $sampleDir -Filter *.hwpx | ForEach-Object {
  $fs = [IO.File]::Open($_.FullName, 'Open', 'Read', 'ReadWrite'); $ms = New-Object IO.MemoryStream; $fs.CopyTo($ms); $fs.Close()
  [IO.File]::WriteAllBytes((Join-Path $sd $_.Name), $ms.ToArray())
}
$size = [math]::Round((Get-Item (Join-Path $outDir $htmlName)).Length / 1KB)
Write-Host "built $outDirName\$htmlName ($size KB, modules $($jsFiles.Count), samples $($samples.Count))"
