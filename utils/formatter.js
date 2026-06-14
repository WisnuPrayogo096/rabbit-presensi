// utils/formatter.js

export class MessageFormatter {
  static formatLoginSuccess(userData) {
    return (
      `✅ *Login Berhasil*\n\n` +
      `👤 Nama: ${[
        userData.gelar_depan,
        userData.full_name,
        userData.gelar_belakang,
      ]
        .filter(Boolean)
        .join(" ")}` +
      `\n📋 NIP: ${userData.nip_pegawai}` +
      `\n🆔 IDF: ${userData.idf}` +
      `\n📞 No. Telp: ${userData.no_telp || "-"}` +
      `\n\n💡 Gunakan /help untuk melihat perintah yang tersedia.`
    );
  }

  static formatLogoutSuccess() {
    return (
      `✅ *Logout Berhasil*\n\n` +
      `Anda telah berhasil logout dari sistem.\n` +
      `Gunakan /login untuk masuk kembali.`
    );
  }

  static formatMesinPresensi(data) {
    if (!data || !data.data || data.data.length === 0) {
      return "📟 *Daftar Mesin Presensi*\n\nTidak ada mesin yang tersedia.";
    }

    let message = "📟 *Daftar Mesin Presensi*\n\n";

    data.data.forEach((mesin, index) => {
      const status = mesin.connection === "Connected" ? "✅" : "❌";
      message +=
        `${index + 1}. ID: ${mesin.id}\n` +
        `   📍 Lokasi: ${mesin.location}\n` +
        `   🌐 IP: ${mesin.ip}\n` +
        `   ${status} Status: ${mesin.connection}\n\n`;
    });

    return message;
  }

  static formatAbsenScheduled(dateStr, timeStr, fpId, status) {
    const statusText =
      status === 0 ? "Masuk" : status === 1 ? "Keluar" : "Lainnya";

    return (
      `⏳ *Jadwal Absen Dibuat*\n\n` +
      `📅 Tanggal: ${dateStr}\n` +
      `🕐 Jam: ${timeStr} WIB\n` +
      `📟 Mesin ID: ${fpId}\n` +
      `📊 Status: ${statusText} (${status})\n\n` +
      `Absensi akan dikirim otomatis pada waktu tersebut.`
    );
  }

  static formatAbsenSuccess(data) {
    if (!data || !data.data) {
      return "✅ Absen berhasil dikirim.";
    }

    const absen = data.data;
    const statusText =
      absen.status === 0 ? "Masuk" : absen.status === 1 ? "Keluar" : "Lainnya";
    const tanggal = new Date(absen.tanggal_absen).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      dateStyle: "full",
      timeStyle: "medium",
    });

    return (
      `✅ *Absen Berhasil*\n\n` +
      `🆔 ID Absen: ${absen.id}\n` +
      `📟 ID Mesin: ${absen.id_fp_finger_mesin}\n` +
      `👤 ID Finger: ${absen.id_finger}\n` +
      `📊 Status: ${statusText}\n` +
      `📅 Tanggal: ${tanggal}\n` +
      `⏰ Diproses: ${new Date(absen.tgl_insert).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
      })}`
    );
  }

  static formatAbsenError(error) {
    return `❌ *Gagal Kirim Absen*\n\n${error}`;
  }

  static formatJadwalList(schedules) {
    if (!schedules || schedules.length === 0) {
      return "📋 *Daftar Jadwal Absen*\n\nBelum ada jadwal absen yang berjalan.";
    }

    let message = "📋 *Daftar Jadwal Absen*\n\n";
    schedules.forEach((s, index) => {
      const statusText = s.status === 0 ? "Masuk" : s.status === 1 ? "Keluar" : "Lainnya";
      message +=
        `${index + 1}. 📅 ${s.dateStr} 🕐 ${s.timeStr} WIB\n` +
        `   📟 Mesin: ${s.fpId} | 📊 Status: ${statusText}\n\n`;
    });

    message += `💡 Untuk menghapus jadwal, gunakan:\n`;
    message += "`/hapus` nomor urut\n";
    message += "Contoh: `/hapus 1`";

    return message;
  }

  static formatHelp() {
    return (
      `📚 *Daftar Perintah Bot*\n\n` +
      `1️⃣ */login* \`<no_telp>\`\n` +
      `   Contoh: /login 081234567890\n` +
      `   Login ke sistem absensi\n\n` +
      `2️⃣ */logout*\n` +
      `   Logout dari sistem\n\n` +
      `3️⃣ */mesin*\n` +
      `   Lihat daftar mesin presensi\n\n` +
      `4️⃣ */jadwal*\n` +
      `   Lihat daftar jadwal absen yang belum dijalankan\n\n` +
      `5️⃣ */absen* \`YYYY-MM-DD HH:mm:ss /fp-X /st-Y\`\n` +
      `   Contoh: /absen 2025-12-08 07:58:01 /fp-3 /st-0\n` +
      `   Jadwalkan absensi otomatis\n` +
      `   • fp = ID mesin presensi\n` +
      `   • st = Status (0=Masuk, 1=Keluar)\n\n` +
      `6️⃣ */hapus* \`<nomor_urut>\`\n` +
      `   Contoh: /hapus 1\n` +
      `   Hapus jadwal absen yang belum dijalankan\n` +
      `   • Lihat nomor urut di /jadwal\n\n` +
      `7️⃣ */help*\n` +
      `   Tampilkan pesan bantuan ini`
    );
  }
}
