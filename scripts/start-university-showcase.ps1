$env:PGLITE_DATA_DIR = './data/university-showcase'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
node node_modules/next/dist/bin/next dev
