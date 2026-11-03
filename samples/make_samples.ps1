# Builds sample HWPX files from sample-docs.json (UTF-8). ASCII-only script for Windows PowerShell 5.1.
# Usage: powershell -ExecutionPolicy Bypass -File samples\make_samples.ps1
param([string]$OutDir = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutDir) { $OutDir = Join-Path $here 'hwpx' }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$enc = New-Object System.Text.UTF8Encoding($false)
$docs = [IO.File]::ReadAllText((Join-Path $here 'sample-docs.json'), $enc) | ConvertFrom-Json

$script:nid = 0
function NextId { $script:nid++; return $script:nid }
function X([string]$s) { return [Security.SecurityElement]::Escape($s) }

$NS = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"'
$SECPR = '<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" tabStopVal="4000" tabStopUnit="HWPUNIT" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0" border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0" hideFirstEmptyLine="0" showLineNumber="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr></hp:secPr>'

function Para([string]$text, [string]$extra = '') {
  $pre = ''
  if ($extra) { $pre = '<hp:run charPrIDRef="0">' + $extra + '</hp:run>' }
  return ('<hp:p id="{0}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">{1}<hp:run charPrIDRef="0"><hp:t>{2}</hp:t></hp:run></hp:p>' -f (NextId), $pre, (X $text))
}

function Table($tbl) {
  $rows = @($tbl.rows)
  $rc = $rows.Count
  $cc = @($rows[0]).Count
  $spans = @{}
  foreach ($s in @($tbl.spans)) { if ($null -ne $s) { $spans["$($s[0]),$($s[1])"] = $s } }
  $colW = [int](42520 / $cc)
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append(('<hp:p id="{0}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:tbl id="{1}" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="{2}" colCnt="{3}" cellSpacing="0" borderFillIDRef="2" noAdjust="0"><hp:sz width="42520" widthRelTo="ABSOLUTE" height="{4}" heightRelTo="ABSOLUTE" protect="0"/><hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:inMargin left="510" right="510" top="141" bottom="141"/>' -f (NextId), (NextId), $rc, $cc, ($rc * 1800)))
  for ($r = 0; $r -lt $rc; $r++) {
    [void]$sb.Append('<hp:tr>')
    $row = @($rows[$r])
    for ($c = 0; $c -lt $cc; $c++) {
      $v = $row[$c]
      if ($null -eq $v) { continue }
      $rs = 1; $cs = 1
      $k = "$r,$c"
      if ($spans.ContainsKey($k)) { $rs = [int]$spans[$k][2]; $cs = [int]$spans[$k][3] }
      $hdr = 0
      if ($r -eq 0) { $hdr = 1 }
      [void]$sb.Append(('<hp:tc name="" header="{0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="2"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER" linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" hasNumRef="0">{1}</hp:subList><hp:cellAddr colAddr="{2}" rowAddr="{3}"/><hp:cellSpan colSpan="{4}" rowSpan="{5}"/><hp:cellSz width="{6}" height="{7}"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>' -f $hdr, (Para ([string]$v)), $c, $r, $cs, $rs, ($colW * $cs), (1800 * $rs)))
    }
    [void]$sb.Append('</hp:tr>')
  }
  [void]$sb.Append('</hp:tbl></hp:run><hp:run charPrIDRef="0"><hp:t/></hp:run></hp:p>')
  return $sb.ToString()
}

$FONTS = ''
foreach ($lang in 'HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER') {
  $FONTS += '<hh:fontface lang="' + $lang + '" fontCnt="1"><hh:font id="0" face="' + (X 'Malgun Gothic') + '" type="TTF" isEmbedded="0"/></hh:fontface>'
}
$BORDER = '<hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:rightBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:topBorder type="SOLID" width="0.12 mm" color="#000000"/><hh:bottomBorder type="SOLID" width="0.12 mm" color="#000000"/>'
$HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hh:head ' + $NS + ' version="1.4" secCnt="1"><hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/><hh:refList>' +
  '<hh:fontfaces itemCnt="7">' + $FONTS + '</hh:fontfaces>' +
  '<hh:borderFills itemCnt="2"><hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/><hh:rightBorder type="NONE" width="0.1 mm" color="#000000"/><hh:topBorder type="NONE" width="0.1 mm" color="#000000"/><hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/><hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill>' +
  '<hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:slash type="NONE" Crooked="0" isCounter="0"/><hh:backSlash type="NONE" Crooked="0" isCounter="0"/>' + $BORDER + '<hh:diagonal type="SOLID" width="0.1 mm" color="#000000"/></hh:borderFill></hh:borderFills>' +
  '<hh:charProperties itemCnt="1"><hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/><hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/></hh:charPr></hh:charProperties>' +
  '<hh:tabProperties itemCnt="1"><hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/></hh:tabProperties>' +
  '<hh:paraProperties itemCnt="1"><hh:paraPr id="0" tabPrIDRef="0" condense="0" fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD" widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/><hh:autoSpacing eAsianEng="0" eAsianNum="0"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/><hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0" offsetBottom="0" connect="0" ignoreMargin="0"/></hh:paraPr></hh:paraProperties>' +
  '<hh:styles itemCnt="1"><hh:style id="0" type="PARA" name="' + (X 'Normal') + '" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/></hh:styles>' +
  '</hh:refList><hh:compatibleDocument targetProgram="HWP201X"><hh:layoutCompatibility/></hh:compatibleDocument><hh:docOption><hh:linkinfo path="" pageInherit="0" footnoteInherit="0"/></hh:docOption></hh:head>'

function AddEntry($zip, [string]$name, [string]$text, [bool]$store = $false) {
  $level = [System.IO.Compression.CompressionLevel]::Optimal
  if ($store) { $level = [System.IO.Compression.CompressionLevel]::NoCompression }
  $entry = $zip.CreateEntry($name, $level)
  $s = $entry.Open()
  $b = $enc.GetBytes($text)
  $s.Write($b, 0, $b.Length)
  $s.Close()
}

foreach ($doc in $docs) {
  $script:nid = 0
  $body = New-Object System.Text.StringBuilder
  $first = $true
  $plain = New-Object System.Text.StringBuilder
  foreach ($b in @($doc.blocks)) {
    if ($null -ne $b.p) {
      if ($first) { [void]$body.Append((Para $b.p $SECPR)); $first = $false } else { [void]$body.Append((Para $b.p)) }
      [void]$plain.AppendLine($b.p)
    } elseif ($null -ne $b.table) {
      [void]$body.Append((Table $b.table))
      foreach ($row in @($b.table.rows)) { [void]$plain.AppendLine((@($row) | ForEach-Object { if ($null -eq $_) { '' } else { $_ } }) -join ' | ') }
    }
  }
  $section = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hs:sec ' + $NS + '>' + $body.ToString() + '</hs:sec>'
  $hpf = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf" version="" unique-identifier="" id=""><opf:metadata><opf:title>' + (X $doc.title) + '</opf:title><opf:language>ko</opf:language></opf:metadata><opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/><opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest><opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>'
  $container = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/><ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/></ocf:rootfiles></ocf:container>'
  $manifest = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>'
  $version = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="12, 0, 0, 0"/>'
  $settings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"><ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/></ha:HWPApplicationSetting>'

  $path = Join-Path $OutDir $doc.file
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
  $zip = [System.IO.Compression.ZipFile]::Open($path, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    AddEntry $zip 'mimetype' 'application/hwp+zip' $true
    AddEntry $zip 'version.xml' $version
    AddEntry $zip 'Contents/header.xml' $HEADER
    AddEntry $zip 'Contents/section0.xml' $section
    AddEntry $zip 'Contents/content.hpf' $hpf
    AddEntry $zip 'settings.xml' $settings
    AddEntry $zip 'META-INF/container.xml' $container
    AddEntry $zip 'META-INF/manifest.xml' $manifest
    AddEntry $zip 'Preview/PrvText.txt' $plain.ToString()
  } finally {
    $zip.Dispose()
  }
  Write-Host "created $path"
}
