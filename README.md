# NodelixcoreOS — Web Server \& Storage Manager

Server berbasis **Node.js + Express** yang dirancang untuk berjalan pada perangkat seperti **Android/Termux** dan digunakan sebagai server lokal untuk mengelola file, storage eksternal, perangkat ESP32, serta kontrol lock door.

Project ini menyediakan antarmuka web untuk mengelola penyimpanan dan berkomunikasi dengan perangkat IoT melalui HTTP/WebSocket.

## Fitur

* Web server berbasis Node.js dan Express
* Login administrator
* File manager berbasis web
* Upload dan download file
* Membuat folder
* Rename file/folder
* Copy dan move file
* Hapus file/folder
* Compress file/folder
* Penyimpanan pada flash disk / external storage
* Dukungan storage melalui Termux
* Monitoring status storage
* Integrasi ESP32
* Integrasi ESP8266/ESP lock door
* WebSocket untuk komunikasi real-time
* Sistem notifikasi
* Integrasi Telegram
* Konfigurasi melalui `.env`
* Dukungan multi-bahasa
* Penyimpanan konfigurasi kalibrasi
* Sistem migrasi storage dari penyimpanan lama ke storage eksternal

## code

* Node.js
* Express
* Multer
* WebSocket (`ws`)
* JavaScript
* HTML
* CSS
* Termux/Android untuk deployment tertentu

## Struktur Project

```text
server8/
├── server.js
├── esp32.js
├── door.js
├── storage.js
├── system.js
├── lang.js
├── migrate.js
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── README.md
├── data/
│   └── calibration.json
└── public/
    ├── index.html
    ├── monitor.js
    ├── monitor.css
    ├── door.js
    ├── system.js
    ├── upload.js
    ├── ui.js
    └── i18n.js
```

> `node\_modules/` 

## Persyaratan

* Node.js
* npm
* Git

Untuk Android/Termux:

* Termux
* Node.js pada Termux
* Akses storage Termux
* Flash disk/external storage jika diperlukan
* root magisk
  
Dengan port default:

```text
http://localhost:3000
```

Dari perangkat lain dalam jaringan:

```text
http://IP-SERVER:3000
```

Contoh:

```text
http://192.168.1.20:3000
```

## Menjalankan di Termux

```bash
pkg update
pkg upgrade
pkg install nodejs git
```
Untuk akses storage Android:

```bash
termux-setup-storage
```

Clone repository:

```bash
git clone https://github.com/alfaidin/NodelixcoreOS
```

Masuk ke project:

```bash
cd ~/NodelixcoreOS
```

Install dependency:

```bash
npm install
```

Buat `.env`:

```bash
cp .env.example .env
```

```bash
nano .env
```

Jalankan:

```bash
npm start
```

## ESP32

Konfigurasi ESP32 dilakukan melalui `.env`:

```env
ESP32_IP=SESUAIKAN_DENGAN_IP_DI_FRIMWARE
ESP32_PORT=80
ESP32_API_KEY=CHANGE_THIS_ESP32_API_KEY
```

Pastikan ESP32 dan server berada pada jaringan yang sama serta IP, port, dan API key sesuai.

## Door Lock

Contoh konfigurasi:

```env
DOOR_IP=SESUAIKAN_DENGAN_IP_DI_FRIMWARE
DOOR_PORT=80
DOOR_API_KEY=CHANGE_THIS_DOOR_API_KEY
DOOR_ENROLL_SECONDS=30
DOOR_POLL_MS=1000
DOOR_NOTIFY_OPEN=false
DOOR_NOTIFY_UNKNOWN=false
```

## Telegram

Jika Telegram digunakan:

```env
TELEGRAM_ALERTS=true
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN
TELEGRAM_CHAT_ID=YOUR_CHAT_ID
```

## Monitoring

Contoh konfigurasi monitoring:

```env
I_WARN_A=5
CELL_V_MAX=4.20
CELL_V_CRIT=3.00
CELL_V_LOW=3.50
CELL_DELTA_WARN=0.10
I_DEADBAND_A=0.10
AC_VOLTAGE_NOMINAL=220
AC_POWER_FACTOR=0.80
```

## Relay

```env
RELAY_LABELS=Relay 1
```

## Bahasa

```env
LANGUAGE=id
```

File `lang.js` menangani teks dan pesan yang digunakan aplikasi.

## Migrasi Storage

Jika diperlukan:

```bash
node migrate.js
```

Pastikan storage tujuan tersedia dan dapat ditulis sebelum melakukan migrasi.

## Update Project

Ambil perubahan terbaru:

```bash
git pull
```

Jika dependency berubah:

```bash
npm install
```

Kemudian:

```bash
npm start
```

## Update ke GitHub

Setelah melakukan perubahan:

```bash
git status
git add .
git commit -m "Update server"
git push
```

## Keamanan

Project sebaiknya digunakan pada jaringan yang dikontrol oleh pemilik.

Untuk deployment ke internet, pertimbangkan:

* HTTPS
* Reverse proxy
* Firewall
* Authentication yang lebih kuat
* Rate limiting
* Session security
* Validasi upload
* Pembatasan ukuran file
* Pembatasan akses storage
* Rotasi API key
* Secret management



## Dependency

Dependency lengkap ditentukan oleh:

```text
package.json
package-lock.json
```

Install dengan:

```bash
npm install
```

## Lisensi

Project ini menggunakan lisensi yang ditentukan pada `package.json`.

## Status

Project masih dalam pengembangan.

Gunakan dan uji pada jaringan lokal sebelum melakukan deployment ke internet.



## Author

Project `NodelixcoreOS` dikembangkan sebagai server lokal/IoT berbasis Node.js untuk pengelolaan storage dan komunikasi dengan perangkat IoT.

## Skema Pemasangan Pin (Pinout Wiring)

Berikut adalah panduan koneksi dan skema pin hardware mikrokontroler yang terhubung ke sistem Server8:

## 1. ESP8266 (Door Lock RFID & LCD)

* **Board**: NodeMCU 1.0 (ESP-12E) / LOLIN (WEMOS) D1 mini
* **Modul RFID RC522**:
  * `3.3V` ➔ `3V3`
  * `GND` ➔ `G` (GND)
  * `RST` ➔ `D0` (GPIO 16)
  * `SDA (SS)` ➔ `D8` (GPIO 15)
  * `SCK` ➔ `D5` (GPIO 14)
  * `MOSI` ➔ `D7` (GPIO 13)
  * `MISO` ➔ `D6` (GPIO 12)
* **Modul LCD 1602 I2C**:
  * `VCC` ➔ `VIN` (5V)
  * `GND` ➔ `G` (GND)
  * `SDA` ➔ `D2` (GPIO 4)
  * `SCL` ➔ `D1` (GPIO 5)
* **Modul Relay**:
  * `VCC` ➔ `VIN` (5V)
  * `GND` ➔ `G` (GND)
  * `IN` ➔ `D4` (GPIO 2) *(Active LOW)*

---

## 2. ESP32 (PLTS Monitor & Relay)

* **Board**: ESP32 Dev Module
* **Sensor Arus ACS712-20A**:
  * `OUT` ➔ `GPIO 34` (ADC1)
* **Pembagi Tegangan Baterai (Voltage Divider)**:
  * Tap 1S ➔ `GPIO 35` (ADC1) 
  * Tap 2S ➔ `GPIO 36 / VP` (ADC1) 
  * Pack 3S ➔ `GPIO 39 / VN` (ADC1) 
* **Modul Relay (4 Channel)**:
  * Relay 1 & 2 (Paralel) ➔ `GPIO 26`
  * Relay 3 ➔ `GPIO 27`
  * Relay 4 ➔ `GPIO 32`

