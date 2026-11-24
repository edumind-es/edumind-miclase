# Servidor local de EDUmind MiClase para Windows (PowerShell, ya viene con Windows).
#
# Sirve la carpeta «app» en http://localhost:8765 y abre el navegador. No
# necesita internet ni EDUmind: la app guarda los datos en el navegador.
# El puerto es SIEMPRE el mismo: con otro, la app aparecería vacía.

$ErrorActionPreference = 'Stop'
$Puerto = 8765
$Raiz = Join-Path $PSScriptRoot 'app'
$Direccion = "http://localhost:$Puerto/"

if (-not (Test-Path $Raiz)) {
  Write-Host 'No encuentro la carpeta «app» junto a este fichero. Descomprime el .zip entero.'
  Read-Host 'Pulsa Intro para salir'
  exit 1
}

$Tipos = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript'; '.mjs' = 'text/javascript'
  '.css' = 'text/css'; '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.jpg' = 'image/jpeg'
  '.woff2' = 'font/woff2'; '.wasm' = 'application/wasm'; '.txt' = 'text/plain; charset=utf-8'
}

$Oyente = New-Object System.Net.HttpListener
$Oyente.Prefixes.Add($Direccion)
try {
  $Oyente.Start()
} catch {
  # ¿Lo que ya escucha en el puerto es MiClase, o es otro programa?
  $EsMiClase = $false
  try {
    $Manifiesto = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 ($Direccion + 'manifest.webmanifest')
    $EsMiClase = $Manifiesto.Content -match 'MiClase'
  } catch { }
  if ($EsMiClase) {
    Write-Host "MiClase ya está en marcha. Abriendo $Direccion"
    Start-Process $Direccion
    exit 0
  }
  Write-Host "Otro programa está usando el puerto $Puerto y MiClase no puede abrirse."
  Write-Host 'Cierra ese programa (o reinicia el equipo) y vuelve a abrir MiClase.'
  Read-Host 'Pulsa Intro para salir'
  exit 1
}

Write-Host 'EDUmind MiClase'
Write-Host "Abierta en $Direccion"
Write-Host 'Deja esta ventana abierta mientras la uses. Para terminar, ciérrala.'
Write-Host 'Consejo: instálala desde el navegador (icono de instalar en la barra de direcciones)'
Write-Host 'y después se abrirá sin esta ventana.'
Start-Process $Direccion

$RaizCompleta = [System.IO.Path]::GetFullPath($Raiz)
while ($Oyente.IsListening) {
  $Contexto = $Oyente.GetContext()
  $Respuesta = $Contexto.Response
  try {
    $Ruta = [System.Uri]::UnescapeDataString($Contexto.Request.Url.AbsolutePath)
    $Fichero = [System.IO.Path]::GetFullPath((Join-Path $Raiz ($Ruta.TrimStart('/') -replace '/', '\')))
    if (Test-Path $Fichero -PathType Container) { $Fichero = Join-Path $Fichero 'index.html' }
    # La app es de una sola página: /evaluacion, /alumnos… son index.html
    if (-not (Test-Path $Fichero -PathType Leaf)) {
      $Ultimo = ($Ruta.TrimEnd('/') -split '/')[-1]
      if (-not $Ultimo.Contains('.') -and -not $Ruta.StartsWith('/api/')) {
        $Fichero = Join-Path $Raiz 'index.html'
      }
    }
    if (-not $Fichero.StartsWith($RaizCompleta) -or -not (Test-Path $Fichero -PathType Leaf)) {
      $Respuesta.StatusCode = 404
    } else {
      $Ext = [System.IO.Path]::GetExtension($Fichero).ToLower()
      $Respuesta.ContentType = if ($Tipos.ContainsKey($Ext)) { $Tipos[$Ext] } else { 'application/octet-stream' }
      if ($Ext -eq '.html' -or $Fichero.EndsWith('sw.js')) { $Respuesta.Headers.Add('Cache-Control', 'no-cache') }
      $Bytes = [System.IO.File]::ReadAllBytes($Fichero)
      $Respuesta.ContentLength64 = $Bytes.Length
      $Respuesta.OutputStream.Write($Bytes, 0, $Bytes.Length)
    }
  } catch {
    $Respuesta.StatusCode = 500
  } finally {
    $Respuesta.OutputStream.Close()
  }
}
