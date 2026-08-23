# fast_dump_paths.ps1
param(
    [string]$outFile = 'C:\Users\swapn\dtid-local_all_contents_fixed-fast.txt',
    [bool]$recursive = $true,
    [bool]$includeDirectoryFilesContent = $true
)

$paths = @(
  'C:\Dev\opsgrid\readme_architecture.md',
  'C:\Dev\opsgrid\readme_core_engine.md',
  'C:\Dev\opsgrid\readme_dashboard.md',
  'C:\Dev\opsgrid\readme_logs_generation_updated.md'
)



# create StreamWriter with a large buffer (overwrite existing file).
$bufferSize = 65536
$sw = New-Object System.IO.StreamWriter($outFile, $false, [System.Text.Encoding]::UTF8, $bufferSize)

function Write-Header($text) { $script:sw.WriteLine("=== $text ===") }
function Write-Blank() { $script:sw.WriteLine("") }

try {
    $script:sw.WriteLine("==== Dump generated: $(Get-Date -Format o) ====")
    $processed = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

    foreach ($p in $paths) {
        if (-not (Test-Path -LiteralPath $p)) {
            Write-Header "Path NOT FOUND: $p"
            Write-Blank
            continue
        }

        $item = Get-Item -LiteralPath $p -Force

        if ($item.PSIsContainer) {
            Write-Header "Directory: $p"
            if ($recursive) {
                $files = Get-ChildItem -LiteralPath $p -Force -File -Recurse -ErrorAction SilentlyContinue
            } else {
                $files = Get-ChildItem -LiteralPath $p -Force -File -ErrorAction SilentlyContinue
            }

            if (-not $files -or $files.Count -eq 0) {
                $script:sw.WriteLine(" (directory empty)")
                Write-Blank
            } else {
                $script:sw.WriteLine("Contents (files):")
                foreach ($f in $files) { $script:sw.WriteLine(" - $($f.FullName)") }
                Write-Blank

                if ($includeDirectoryFilesContent) {
                    foreach ($f in $files) {
                        if ($processed.Contains($f.FullName)) { continue }
                        $processed.Add($f.FullName) | Out-Null

                        Write-Header "FILE: $($f.FullName)"
                        try {
                            # Open file stream and read first chunk to detect binary (null byte)
                            $fs = [System.IO.File]::Open($f.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                            $probeSize = 4096
                            $probe = New-Object byte[] $probeSize
                            $read = $fs.Read($probe, 0, $probeSize)
                            $isBinary = $false
                            for ($i = 0; $i -lt $read; $i++) { if ($probe[$i] -eq 0) { $isBinary = $true; break } }
                            $fs.Close()

                            if ($isBinary) {
                                $script:sw.WriteLine("[binary file - content skipped]")
                            } else {
                                # Read as text streaming via Get-Content -Raw (fast enough) then write once.
                                try {
                                    $txt = Get-Content -LiteralPath $f.FullName -Raw -ErrorAction Stop
                                    # write file contents (don't double-add blank line if file already ends with newline)
                                    $script:sw.Write($txt)
                                    $script:sw.WriteLine()  # maintain separation after file
                                } catch {
                                    # fallback: read as bytes and convert UTF8 if needed
                                    try {
                                        $txt = [System.IO.File]::ReadAllText($f.FullName, [System.Text.Encoding]::UTF8)
                                        $script:sw.Write($txt)
                                        $script:sw.WriteLine()
                                    } catch {
                                        $script:sw.WriteLine("[error reading file as text: $($_.Exception.Message)]")
                                    }
                                }
                            }
                        } catch {
                            $script:sw.WriteLine("[error reading file: $($_.Exception.Message)]")
                        }
                        Write-Blank
                    }
                }
            }
        } else {
            # single file
            $full = $item.FullName
            if ($processed.Contains($full)) { continue }
            $processed.Add($full) | Out-Null

            Write-Header "FILE: $full"
            try {
                $fs = [System.IO.File]::Open($full, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                $probeSize = 4096
                $probe = New-Object byte[] $probeSize
                $read = $fs.Read($probe, 0, $probeSize)
                $isBinary = $false
                for ($i = 0; $i -lt $read; $i++) { if ($probe[$i] -eq 0) { $isBinary = $true; break } }
                $fs.Close()

                if ($isBinary) {
                    $script:sw.WriteLine("[binary file - content skipped]")
                } else {
                    try {
                        $txt = Get-Content -LiteralPath $full -Raw -ErrorAction Stop
                        $script:sw.Write($txt)
                        $script:sw.WriteLine()
                    } catch {
                        try {
                            $txt = [System.IO.File]::ReadAllText($full, [System.Text.Encoding]::UTF8)
                            $script:sw.Write($txt)
                            $script:sw.WriteLine()
                        } catch {
                            $script:sw.WriteLine("[error reading file as text: $($_.Exception.Message)]")
                        }
                    }
                }
            } catch {
                $script:sw.WriteLine("[error reading file: $($_.Exception.Message)]")
            }
            Write-Blank
        }
    }

    $script:sw.WriteLine("==== End of dump: $(Get-Date -Format o) ====")
} finally {
    $script:sw.Flush()
    $script:sw.Close()
}

Write-Host "Done. Fast output written to: $outFile"
