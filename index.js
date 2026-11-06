const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { exec } = require('child_process');
const si = require('systeminformation');
const os = require('os');
const path = require('path');
const fs = require('fs');
const NodeWebcam = require('node-webcam');
const screenshot = require('screenshot-desktop');
require('dotenv').config();

let currentDir = process.cwd();
const OWNER_ID = process.env.OWNER_ID ? process.env.OWNER_ID.trim() : null;

// Pomocnicza funkcja do bezpiecznego wykonywania PowerShell z kodowaniem Base64 (UTF-16LE)
function runPowershell(script, callback) {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    exec(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, (err, stdout, stderr) => {
        if (callback) callback(err, stdout ? stdout.trim() : '', stderr ? stderr.trim() : '');
    });
}

// Pomocnicze funkcje formatowania
function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${d > 0 ? d + 'd ' : ''}${h}h ${m}m ${s}s`;
}

function createProgressBar(percent, length = 12) {
    const safePercent = Math.min(Math.max(percent || 0, 0), 100);
    const filled = Math.round((safePercent / 100) * length);
    const empty = length - filled;
    return `\`[${'█'.repeat(filled)}${'░'.repeat(empty)}]\` **${safePercent.toFixed(1)}%**`;
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`===============================================`);
    console.log(`🤖 Bot Remote PC zalogowany jako: ${client.user.tag}`);
    console.log(`📁 Aktualny katalog roboczy: ${currentDir}`);
    if (OWNER_ID) {
        console.log(`🔒 Zabezpieczenie aktywne: bot odpowiada tylko dla użytkownika ID: ${OWNER_ID}`);
    } else {
        console.log(`⚠️ OWNER_ID nie jest ustawione w .env - bot będzie odpowiadał każdemu.`);
    }
    console.log(`===============================================`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const input = message.content.slice(1).trim();
    if (!input) return;

    const args = input.split(' ');
    const command = args.shift().toLowerCase();

    // ----------------------------------------------------
    // HELP: !help, !help everyone
    // ----------------------------------------------------
    if (command === 'help') {
        const sub = args[0] ? args[0].toLowerCase() : '';

        if (sub === 'everyone') {
            const embedEveryone = new EmbedBuilder()
                .setTitle('👥 Informacje o dostępie i uprawnieniach')
                .setColor(0x3498db)
                .setDescription(
                    OWNER_ID
                        ? `🔒 **Ten bot jest w trybie prywatnym.**\nWszystkie komendy administracyjne są zastrzeżone wyłącznie dla właściciela (<@${OWNER_ID}>). Pozostali użytkownicy nie mogą wydawać poleceń systemowych.`
                        : `⚠️ **Ten bot jest w trybie otwartym.**\nKażdy użytkownik na serwerze może wydawać komendy. Aby ograniczyć dostęp, ustaw zmienną \`OWNER_ID\` w pliku \`.env\`.`
                )
                .addFields(
                    { name: '👤 Twój profil', value: `Nick: **${message.author.tag}**\nTwoje ID: \`${message.author.id}\`` },
                    { name: '🛡️ Twoje uprawnienia', value: (!OWNER_ID || message.author.id === OWNER_ID) ? '✅ Posiadasz pełne uprawnienia administratora.' : '⛔ Brak uprawnień do sterowania komputerem.' }
                )
                .setTimestamp();

            message.reply({ embeds: [embedEveryone] });
            return;
        }

        const embedHelp = new EmbedBuilder()
            .setTitle('🖥️ Panel Sterowania Komputerem (Remote PC Bot)')
            .setDescription('Katalog komend posortowany tematycznie:')
            .setColor(0x00AE86)
            .addFields(
                {
                    name: 'ℹ️ Information (Diagnostyka)',
                    value: [
                        '`!komp` – Szczegółowa specyfikacja sprzętowa PC',
                        '`!uptime` – Czas działania komputera i bota oraz data uruchomienia',
                        '`!proc` – Top procesy obciążające system',
                        '`!mem` – Szczegółowa diagnostyka RAM i pamięci wirtualnej (Swap)',
                        '`!disk` – Wykaz dysków fizycznych i partycji z paskami zajętości',
                        '`!status` – Szybki dashboard obciążenia CPU/RAM na żywo'
                    ].join('\n')
                },
                {
                    name: '🐚 Shell (Katalog roboczy)',
                    value: [
                        '`!cd <folder>` – Zmiana bieżącego katalogu roboczego',
                        '`!ls` / `!dir` – Przeglądanie plików i katalogów w obecnej ścieżce'
                    ].join('\n')
                },
                {
                    name: '⚙️ System (Zarządzanie)',
                    value: [
                        '`!task` – Lista aktywnych zadań w systemie (tasklist)',
                        '`!restart` – Ponowne uruchomienie PC (odliczanie 15s)',
                        '`!sleep` – Uśpienie komputera (stan uśpienia)',
                        '`!lock` – Natychmiastowe zablokowanie stacji roboczej (Win+L)',
                        '`!bomba` – Wyłączenie komputera (odliczanie 15s)',
                        '`!anuluj` – Anulowanie planowanego wyłączenia lub restartu',
                        '`!wyloguj` – Wylogowanie użytkownika Windows',
                        '`!ubij <nazwa/PID>` – Zakończenie procesu'
                    ].join('\n')
                },
                {
                    name: '🌐 Network (Narzędzia sieciowe)',
                    value: [
                        '`!ip` – Publiczny oraz lokalne adresy IP (IPv4)',
                        '`!ping <host>` – Test odpowiedzi ICMP (ping)',
                        '`!dns <domena>` – Sprawdzenie rekordów DNS (nslookup)',
                        '`!traceroute <host>` – Śledzenie trasy pakietów (tracert)'
                    ].join('\n')
                },
                {
                    name: '🛡️ Security (Inspekcja bezpieczeństwa)',
                    value: [
                        '`!whoami` – Aktywny użytkownik, hostname i poziom uprawnień',
                        '`!defender` – Status ochrony antywirusowej Windows Defender',
                        '`!scquery <usługa>` – Sprawdzenie stanu usługi Windows (np. `spooler`)'
                    ].join('\n')
                },
                {
                    name: '📁 Files (Operacje na plikach)',
                    value: [
                        '`!upload` – Zapisanie załączonego pliku na dysku komputera',
                        '`!download <plik>` – Pobranie pliku z komputera na Discord',
                        '`!zip <archiwum.zip> <ścieżka>` – Spakowanie pliku lub folderu do ZIP',
                        '`!unzip <plik.zip> [katalog]` – Rozpakowanie archiwum ZIP'
                    ].join('\n')
                },
                {
                    name: '📸 Screen (Zrzuty ekranu i kamera)',
                    value: [
                        '`!screenshot` (lub `!screen`) – Zrzut ekranu monitora',
                        '`!webcam` (lub `!kamerka`) – Zdjęcie z kamerki internetowej'
                    ].join('\n')
                },
                {
                    name: '🔊 Audio (Dźwięk i Mowa)',
                    value: [
                        '`!volume <0-100>` – Ustawienie głośności systemowej',
                        '`!mute` – Przełącznik wyciszenia dźwięku',
                        '`!tts <tekst>` – Przeczytanie tekstu na głos przez głośniki',
                        '`!playpause`, `!next`, `!prev` – Klawisze multimedialne'
                    ].join('\n')
                },
                {
                    name: '🌍 Browser (Przeglądarka)',
                    value: '`!browser [url_lub_app]` – Otwarcie strony lub aplikacji (np. `!browser youtube.com`)'
                },
                {
                    name: '🎉 Fun (Efekty i powiadomienia)',
                    value: [
                        '`!rickroll` – Niespodzianka w przeglądarce 🕺',
                        '`!matrix` – Hakerski wodospad cyfr Matrix w nowym oknie CMD 🟩',
                        '`!toast <tytuł | treść>` – Natywne powiadomienie banerowe Windows 10/11',
                        '`!warning <tekst>` – Okienko z ostrzeżeniem systemowym i dźwiękiem',
                        '`!popup <tekst>` – Zwykłe okienko informacyjne (MessageBox)'
                    ].join('\n')
                },
                {
                    name: '📋 Schowek i Terminal',
                    value: [
                        '`!schowek` / `!kopiuj <tekst>` – Odczyt i zapis schowka Windows',
                        '`!<komenda_cmd>` – Bezpośrednie wykonanie polecenia w konsoli CMD'
                    ].join('\n')
                }
            )
            .setFooter({ text: `Katalog: ${currentDir} | Wpisz !help everyone aby sprawdzić uprawnienia` })
            .setTimestamp();

        message.reply({ embeds: [embedHelp] });
        return;
    }

    // Sprawdzenie uprawnień (jeśli ustawiono OWNER_ID w .env)
    if (OWNER_ID && message.author.id !== OWNER_ID) {
        return message.reply('⛔ **Brak uprawnień:** Tylko właściciel bota może wydawać polecenia temu komputerowi.');
    }

    // ====================================================
    // 1. INFORMATION: !komp, !uptime, !proc, !mem, !disk, !status
    // ====================================================

    // !komp – Specyfikacja sprzętowa
    if (command === 'komp') {
        try {
            const cpu = await si.cpu();
            const gpu = await si.graphics();
            const mem = await si.mem();
            const disks = await si.diskLayout();
            const fsData = await si.fsSize();
            const totalDiskSize = disks.reduce((acc, disk) => acc + disk.size, 0);
            const totalDiskGB = (totalDiskSize / (1024 ** 3)).toFixed(2);
            const totalRAM = (mem.total / (1024 ** 3)).toFixed(2);
            const driveLetters = fsData.map(disk => `${disk.mount} (${formatBytes(disk.size)})`).join(', ');

            const embed = new EmbedBuilder()
                .setTitle('🖥️ Specyfikacja Techniczna Komputera')
                .setColor(0x00AE86)
                .addFields(
                    { name: '💻 Procesor', value: `${cpu.manufacturer} ${cpu.brand} (${cpu.cores} rdzeni, ${cpu.speed} GHz)`, inline: false },
                    { name: '🎮 Karta Graficzna', value: gpu.controllers.map(g => g.model).join(', ') || 'Brak informacji', inline: false },
                    { name: '🧠 Pamięć RAM', value: `${totalRAM} GB`, inline: true },
                    { name: '💾 Dyski Fizyczne', value: `${disks.length} dysk(ów) [Łącznie: ${totalDiskGB} GB]`, inline: true },
                    { name: '📂 Partycje', value: driveLetters || 'Brak', inline: false }
                )
                .setFooter({ text: `Host: ${os.hostname()} | OS: ${os.type()} ${os.arch()}` });

            message.reply({ embeds: [embed] });
        } catch (err) {
            message.reply(`❌ Błąd: ${err.message}`);
        }
        return;
    }

    // !uptime – Czas działania
    if (command === 'uptime') {
        try {
            const timeData = await si.time();
            const sysUptime = formatUptime(timeData.uptime);
            const botUptime = formatUptime(process.uptime());
            const bootTime = new Date(Date.now() - (timeData.uptime * 1000)).toLocaleString('pl-PL');

            const embed = new EmbedBuilder()
                .setTitle('⏱️ Czas Działania (Uptime)')
                .setColor(0x3498db)
                .addFields(
                    { name: '🖥️ Uptime Systemu', value: `**${sysUptime}**`, inline: true },
                    { name: '🤖 Uptime Bota', value: `**${botUptime}**`, inline: true },
                    { name: '📅 Ostatni rozruch komputera', value: bootTime, inline: false }
                )
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } catch (err) {
            message.reply(`❌ Błąd: ${err.message}`);
        }
        return;
    }

    // !proc / !procesy – Top procesy
    if (command === 'proc' || command === 'procesy') {
        try {
            const procData = await si.processes();
            const top = procData.list
                .filter(p => p.name !== 'System Idle Process')
                .sort((a, b) => b.cpu - a.cpu)
                .slice(0, 8);

            const listFormatted = top.map((p, idx) => {
                const memMB = (p.memRss / 1024).toFixed(0);
                return `**${idx + 1}. \`${p.name}\`** (PID: \`${p.pid}\`)\n└ CPU: **${p.cpu.toFixed(1)}%** | RAM: **${memMB} MB**`;
            }).join('\n\n');

            const embed = new EmbedBuilder()
                .setTitle('⚡ Top 8 Procesów (wg zużycia CPU)')
                .setDescription(listFormatted || 'Brak aktywnych procesów.')
                .setColor(0x3498db)
                .setFooter({ text: `Łączna liczba procesów w systemie: ${procData.all}` })
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } catch (err) {
            message.reply(`❌ Błąd: ${err.message}`);
        }
        return;
    }

    // !mem – Diagnostyka pamięci RAM i Swap
    if (command === 'mem') {
        try {
            const mem = await si.mem();
            const totalRAM = (mem.total / (1024 ** 3)).toFixed(2);
            const usedRAM = (mem.active / (1024 ** 3)).toFixed(2);
            const freeRAM = (mem.available / (1024 ** 3)).toFixed(2);
            const ramPercent = (mem.active / mem.total) * 100;

            const totalSwap = (mem.swaptotal / (1024 ** 3)).toFixed(2);
            const usedSwap = (mem.swapused / (1024 ** 3)).toFixed(2);
            const swapPercent = mem.swaptotal > 0 ? (mem.swapused / mem.swaptotal) * 100 : 0;

            const embed = new EmbedBuilder()
                .setTitle('🧠 Diagnostyka Pamięci RAM i Pamięci Wirtualnej')
                .setColor(ramPercent > 85 ? 0xe74c3c : 0x2ecc71)
                .addFields(
                    {
                        name: '📊 Pamięć Fizyczna (RAM)',
                        value: `${createProgressBar(ramPercent)}\n• Całkowita: **${totalRAM} GB**\n• Użyta: **${usedRAM} GB**\n• Dostępna: **${freeRAM} GB**`,
                        inline: false
                    },
                    {
                        name: '💾 Pamięć Wirtualna (Swap / Plik stronicowania)',
                        value: `${createProgressBar(swapPercent)}\n• Całkowita: **${totalSwap} GB**\n• Użyta: **${usedSwap} GB**`,
                        inline: false
                    }
                )
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } catch (err) {
            message.reply(`❌ Błąd: ${err.message}`);
        }
        return;
    }

    // !disk – Diagnostyka dysków i partycji
    if (command === 'disk') {
        try {
            const fsData = await si.fsSize();
            const diskLayout = await si.diskLayout();

            const fields = fsData.map(d => {
                const totalGB = (d.size / (1024 ** 3)).toFixed(1);
                const usedGB = (d.used / (1024 ** 3)).toFixed(1);
                const freeGB = ((d.size - d.used) / (1024 ** 3)).toFixed(1);
                return {
                    name: `💽 Partycja ${d.mount} [${d.type || 'NTFS'}]`,
                    value: `${createProgressBar(d.use)}\n• Rozmiar: **${totalGB} GB** | Wolne: **${freeGB} GB** (Zajęte: ${usedGB} GB)`,
                    inline: false
                };
            });

            const diskSummary = diskLayout.map(d => `• **${d.name || d.vendor}** – ${(d.size / (1024 ** 3)).toFixed(0)} GB (${d.type || d.interfaceType})`).join('\n');

            const embed = new EmbedBuilder()
                .setTitle('💾 Diagnostyka Dysków i Partycji')
                .setDescription(`**Dyski fizyczne:**\n${diskSummary || 'Brak danych'}`)
                .setColor(0x3498db)
                .addFields(fields.slice(0, 10))
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } catch (err) {
            message.reply(`❌ Błąd: ${err.message}`);
        }
        return;
    }

    // !status – Pulpit podsumowujący na żywo
    if (command === 'status') {
        try {
            const [load, mem, battery, time] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.battery(),
                si.time()
            ]);

            const cpuLoad = load.currentLoad;
            const ramUsedGB = (mem.active / (1024 ** 3)).toFixed(2);
            const ramTotalGB = (mem.total / (1024 ** 3)).toFixed(2);
            const ramPercent = (mem.active / mem.total) * 100;
            const uptime = formatUptime(time.uptime);

            const embed = new EmbedBuilder()
                .setTitle('📊 Monitor Zasobów Systemu')
                .setColor(cpuLoad > 85 ? 0xe74c3c : 0x2ecc71)
                .addFields(
                    { name: '🔥 Obciążenie Procesora (CPU)', value: `${createProgressBar(cpuLoad)}`, inline: false },
                    { name: '🧠 Pamięć RAM', value: `${createProgressBar(ramPercent)}\n*(Użyte: ${ramUsedGB} GB / ${ramTotalGB} GB)*`, inline: false },
                    { name: '⏱️ Czas działania (Uptime)', value: uptime, inline: true },
                    { name: '🔋 Bateria', value: battery.hasBattery ? `${battery.percent}% ${battery.isCharging ? '⚡ (Ładowanie)' : '🔋'}` : 'Zasilanie sieciowe 🔌', inline: true }
                )
                .setFooter({ text: `Host: ${os.hostname()} | System: ${os.type()} ${os.release()}` })
                .setTimestamp();

            message.reply({ embeds: [embed] });
        } catch (err) {
            message.reply(`❌ Błąd: ${err.message}`);
        }
        return;
    }

    // ====================================================
    // 2. SHELL: !cd, !ls, !dir
    // ====================================================

    // !cd <folder>
    if (command === 'cd') {
        const targetDir = args.join(' ');
        if (!targetDir) {
            message.reply(`📁 Bieżący katalog to:\n\`\`\`\n${currentDir}\n\`\`\``);
            return;
        }

        try {
            const newDir = path.resolve(currentDir, targetDir);
            if (!fs.existsSync(newDir)) {
                message.reply('❌ Wskazany folder nie istnieje.');
                return;
            }
            process.chdir(newDir);
            currentDir = newDir;
            message.reply(`📁 Zmieniono katalog na:\n\`\`\`\n${currentDir}\n\`\`\``);
        } catch (err) {
            message.reply(`❌ Błąd przy zmianie katalogu: ${err.message}`);
        }
        return;
    }

    // !ls / !dir
    if (command === 'ls' || command === 'dir') {
        fs.readdir(currentDir, { withFileTypes: true }, (err, items) => {
            if (err) return message.reply(`❌ Błąd odczytu katalogu: ${err.message}`);

            const dirs = [];
            const files = [];

            for (const item of items) {
                if (item.isDirectory()) {
                    dirs.push(`📁 \`${item.name}/\``);
                } else {
                    try {
                        const stats = fs.statSync(path.join(currentDir, item.name));
                        files.push(`📄 \`${item.name}\` *(${formatBytes(stats.size)})*`);
                    } catch {
                        files.push(`📄 \`${item.name}\``);
                    }
                }
            }

            const dirText = dirs.slice(0, 15).join('\n') || '*Brak folderów*';
            const fileText = files.slice(0, 15).join('\n') || '*Brak plików*';

            const embed = new EmbedBuilder()
                .setTitle(`📁 Zawartość katalogu`)
                .setDescription(`\`${currentDir}\``)
                .setColor(0x3498db)
                .addFields(
                    { name: `Katalogi (${dirs.length})`, value: dirText.slice(0, 1024), inline: true },
                    { name: `Pliki (${files.length})`, value: fileText.slice(0, 1024), inline: true }
                )
                .setFooter({ text: 'Użyj !download <nazwa> aby pobrać plik' });

            message.reply({ embeds: [embed] });
        });
        return;
    }

    // ====================================================
    // 3. SYSTEM: !task, !restart, !sleep, !lock, !bomba, !anuluj, !wyloguj, !ubij
    // ====================================================

    // !task – Lista aktywnych zadań (tasklist)
    if (command === 'task') {
        exec('tasklist /FO TABLE', (err, stdout) => {
            if (err) return message.reply(`❌ Błąd: ${err.message}`);
            const lines = stdout.trim().split('\n');
            const preview = lines.slice(0, 35).join('\n');
            message.reply(`⚙️ **Aktywne procesy (pierwsze 35):**\n\`\`\`cmd\n${preview}\n\`\`\`\n*(Łącznie linii: ${lines.length})*`);
        });
        return;
    }

    // !restart – Restart PC
    if (command === 'restart') {
        message.reply('🔄 **Restartowanie komputera za 15 sekund!**\nAby przerwać, wpisz natychmiast `!anuluj`.');
        exec('shutdown /r /t 15', (err) => {
            if (err) message.reply(`❌ Błąd restartu: ${err.message}`);
        });
        return;
    }

    // !sleep – Uśpienie komputera
    if (command === 'sleep') {
        message.reply('💤 **Przełączanie komputera w stan uśpienia...** Dobranoc!');
        setTimeout(() => {
            exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', (err) => {
                if (err) message.reply(`❌ Błąd uśpienia: ${err.message}`);
            });
        }, 1500);
        return;
    }

    // !lock / !zablokuj – Blokada stacji roboczej
    if (command === 'lock' || command === 'zablokuj') {
        exec('rundll32.exe user32.dll,LockWorkStation', (err) => {
            if (err) return message.reply(`❌ Błąd: ${err.message}`);
            message.reply('🔒 **Zablokowano stację roboczą (ekran logowania Windows).**');
        });
        return;
    }

    // !bomba – Wyłączenie PC
    if (command === 'bomba') {
        message.reply('💣 **Komputer zostanie wyłączony za 15 sekund!**\nAby anulować wyłączenie, wpisz `!anuluj`.');
        exec('shutdown /s /t 15', (error) => {
            if (error) message.reply(`❌ Nie udało się zaplanować wyłączenia: ${error.message}`);
        });
        return;
    }

    // !anuluj – Anulowanie shutdown / restart
    if (command === 'anuluj') {
        exec('shutdown /a', (err) => {
            if (err) {
                message.reply('⚠️ Brak aktywnego wyłączenia do anulowania.');
            } else {
                message.reply('🛑 **Pomyślnie anulowano wyłączenie lub restart komputera!**');
            }
        });
        return;
    }

    // !wyloguj – Wylogowanie
    if (command === 'wyloguj') {
        message.reply('📤 Wylogowywanie aktywnego użytkownika...');
        exec('shutdown /l', (error) => {
            if (error) message.reply(`❌ Błąd wylogowania: ${error.message}`);
        });
        return;
    }

    // !ubij <nazwa/PID>
    if (command === 'ubij') {
        const target = args[0];
        if (!target) return message.reply('❌ Podaj nazwę procesu (np. `!ubij chrome.exe`) lub PID (np. `!ubij 1234`).');
        const isPid = /^\d+$/.test(target);
        const killCmd = isPid ? `taskkill /F /PID ${target}` : `taskkill /F /IM "${target}"`;
        exec(killCmd, (err, stdout, stderr) => {
            if (err) {
                message.reply(`❌ Nie udało się zakończyć procesu:\n\`\`\`\n${stderr || err.message}\n\`\`\``);
            } else {
                message.reply(`🔪 Pomyślnie zakończono proces: \`${target}\``);
            }
        });
        return;
    }

    // ====================================================
    // 4. NETWORK: !ip, !ping, !dns, !traceroute
    // ====================================================

    // !ip – Informacje o adresach IP
    if (command === 'ip') {
        const ifaces = os.networkInterfaces();
        const localIps = [];
        for (const [name, netList] of Object.entries(ifaces)) {
            for (const net of netList) {
                if (!net.internal && net.family === 'IPv4') {
                    localIps.push(`• **${name}:** \`${net.address}\``);
                }
            }
        }

        let publicIp = 'Nie udało się pobrać';
        try {
            const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
            const data = await res.json();
            publicIp = data.ip;
        } catch {}

        const embed = new EmbedBuilder()
            .setTitle('🌐 Diagnostyka Sieciowa – Adresy IP')
            .setColor(0x3498db)
            .addFields(
                { name: '🌍 Publiczne IP (WAN)', value: `\`${publicIp}\``, inline: false },
                { name: '🏠 Lokalne IP (LAN)', value: localIps.join('\n') || 'Brak aktywnych kart sieciowych', inline: false },
                { name: '💻 Nazwa Hosta', value: `\`${os.hostname()}\``, inline: true }
            )
            .setTimestamp();

        message.reply({ embeds: [embed] });
        return;
    }

    // !ping <host>
    if (command === 'ping') {
        const host = args[0] || '8.8.8.8';
        const sent = await message.reply(`📡 Wysyłanie pakietów ICMP (ping) do \`${host}\`...`);
        exec(`ping -n 4 "${host}"`, (err, stdout) => {
            if (err && !stdout) return sent.edit(`❌ Błąd pingowania \`${host}\`: ${err.message}`);
            sent.edit(`📡 **Wynik ping (\`${host}\`):**\n\`\`\`cmd\n${stdout.trim()}\n\`\`\``);
        });
        return;
    }

    // !dns <domena>
    if (command === 'dns') {
        const domain = args[0];
        if (!domain) return message.reply('❌ Podaj domenę do zbadania (np. `!dns google.com`).');
        exec(`nslookup "${domain}"`, (err, stdout) => {
            if (err && !stdout) return message.reply(`❌ Błąd DNS: ${err.message}`);
            message.reply(`🔍 **Wynik nslookup dla \`${domain}\`:**\n\`\`\`cmd\n${stdout.trim().slice(0, 1900)}\n\`\`\``);
        });
        return;
    }

    // !traceroute / !tracert <host>
    if (command === 'traceroute' || command === 'tracert') {
        const targetHost = args[0] || '8.8.8.8';
        const sent = await message.reply(`🛣️ Rozpoczynanie śledzenia trasy (tracert) do \`${targetHost}\` (max 15 przeskoków). Czekaj...`);
        exec(`tracert -d -h 15 "${targetHost}"`, (err, stdout) => {
            if (err && !stdout) return sent.edit(`❌ Błąd traceroute: ${err.message}`);
            const trimmed = stdout.length > 1900 ? stdout.slice(0, 1900) + '\n... (obcięto)' : stdout;
            sent.edit(`🛣️ **Trasa pakietów do \`${targetHost}\`:**\n\`\`\`cmd\n${trimmed}\n\`\`\``);
        });
        return;
    }

    // ====================================================
    // 5. SECURITY: !whoami, !defender, !scquery
    // ====================================================

    // !whoami – Tożsamość i uprawnienia
    if (command === 'whoami') {
        const username = os.userInfo().username;
        const hostname = os.hostname();
        const platform = `${os.type()} ${os.release()} (${os.arch()})`;

        runPowershell("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)", (err, stdout) => {
            const isAdmin = stdout === 'True';
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Tożsamość i Uprawnienia Systemowe (whoami)')
                .setColor(isAdmin ? 0xe74c3c : 0x2ecc71)
                .addFields(
                    { name: '👤 Zalogowany użytkownik', value: `\`${username}\``, inline: true },
                    { name: '💻 Host komputera', value: `\`${hostname}\``, inline: true },
                    { name: '⚡ Uprawnienia Administratora', value: isAdmin ? '🔴 **TAK (Administrator)**' : '🟢 Nie (Zwykły użytkownik)', inline: false },
                    { name: '🖥️ Wersja systemu', value: platform, inline: false }
                )
                .setTimestamp();

            message.reply({ embeds: [embed] });
        });
        return;
    }

    // !defender – Stan Windows Defender
    if (command === 'defender') {
        const psScript = `Get-MpComputerStatus | Select-Object AntivirusEnabled, RealTimeProtectionEnabled, AntivirusSignatureLastUpdated, AntispywareEnabled, BehaviorMonitorEnabled, IoavProtectionEnabled | Format-List`;
        runPowershell(psScript, (err, stdout) => {
            if (err) return message.reply(`❌ Błąd odczytu Windows Defender: ${err.message}`);
            const isProtected = stdout.includes('AntivirusEnabled              : True');
            const embed = new EmbedBuilder()
                .setTitle('🛡️ Stan Ochrony Windows Defender')
                .setDescription(`\`\`\`yaml\n${stdout.trim()}\n\`\`\``)
                .setColor(isProtected ? 0x2ecc71 : 0xe74c3c)
                .setTimestamp();
            message.reply({ embeds: [embed] });
        });
        return;
    }

    // !scquery <usługa> – Inspekcja usług Windows
    if (command === 'scquery') {
        const serviceName = args[0];
        if (!serviceName) {
            return message.reply('❌ Podaj nazwę usługi Windows (np. `!scquery spooler`, `!scquery wuauserv`, `!scquery WinDefend`).');
        }
        exec(`sc.exe query "${serviceName}"`, (err, stdout, stderr) => {
            const output = (stdout || stderr || err?.message || 'Brak danych').trim();
            const isRunning = output.includes('RUNNING');
            const embed = new EmbedBuilder()
                .setTitle(`⚙️ Inspekcja Usługi Windows: ${serviceName}`)
                .setDescription(`\`\`\`cmd\n${output.slice(0, 1900)}\n\`\`\``)
                .setColor(isRunning ? 0x2ecc71 : 0xf39c12)
                .setTimestamp();
            message.reply({ embeds: [embed] });
        });
        return;
    }

    // ====================================================
    // 6. FILES: !upload, !download, !zip, !unzip
    // ====================================================

    // !upload – Zapisanie załącznika
    if (command === 'upload') {
        const attachment = message.attachments.first();
        if (!attachment) {
            message.reply('❌ Załącz plik do wiadomości i wpisz `!upload`');
            return;
        }

        const savePath = path.join(currentDir, attachment.name);
        try {
            const res = await fetch(attachment.url);
            if (!res.ok) throw new Error(`HTTP: ${res.status}`);
            const buffer = Buffer.from(await res.arrayBuffer());
            fs.writeFileSync(savePath, buffer);
            message.reply(`📥 Pomyślnie zapisano plik **\`${attachment.name}\`** (${formatBytes(buffer.length)}) w:\n\`${currentDir}\``);
        } catch (err) {
            message.reply(`❌ Błąd pobierania pliku: ${err.message}`);
        }
        return;
    }

    // !download / !pobierz <plik>
    if (command === 'download' || command === 'pobierz') {
        const fileName = args.join(' ');
        if (!fileName) return message.reply('❌ Podaj nazwę pliku: `!download <nazwa_pliku>`');

        const targetPath = path.resolve(currentDir, fileName);
        if (!fs.existsSync(targetPath)) return message.reply('❌ Taki plik nie istnieje w bieżącym katalogu.');

        const stats = fs.statSync(targetPath);
        if (stats.isDirectory()) return message.reply('❌ Podana ścieżka to folder. Użyj `!zip archiwum.zip <folder>` przed pobraniem.');

        if (stats.size > 25 * 1024 * 1024) {
            return message.reply(`❌ Plik jest za duży (${formatBytes(stats.size)}). Limit wysyłania Discorda to 25 MB.`);
        }

        message.reply({
            content: `📤 Plik: \`${path.basename(targetPath)}\` (${formatBytes(stats.size)})`,
            files: [targetPath]
        }).catch(err => {
            message.reply(`❌ Błąd wysyłania: ${err.message}`);
        });
        return;
    }

    // !zip <archiwum.zip> <ścieżka>
    if (command === 'zip') {
        if (args.length < 2) {
            return message.reply('❌ Użycie: `!zip <nazwa_archiwum.zip> <plik_lub_folder>`\nPrzykład: `!zip archiwum.zip zdjecie.jpg`');
        }
        const destZip = args[0].endsWith('.zip') ? args[0] : `${args[0]}.zip`;
        const sourcePath = args.slice(1).join(' ');
        const fullSource = path.resolve(currentDir, sourcePath);
        const fullDest = path.resolve(currentDir, destZip);

        if (!fs.existsSync(fullSource)) return message.reply('❌ Wskazany plik lub folder źródłowy nie istnieje.');

        const psScript = `Compress-Archive -Path '${fullSource.replace(/'/g, "''")}' -DestinationPath '${fullDest.replace(/'/g, "''")}' -Force`;
        runPowershell(psScript, (err) => {
            if (err) return message.reply(`❌ Błąd kompresji ZIP: ${err.message}`);
            const stats = fs.statSync(fullDest);
            message.reply(`📦 Pomyślnie utworzono archiwum: **\`${destZip}\`** (${formatBytes(stats.size)})`);
        });
        return;
    }

    // !unzip <plik.zip> [katalog_docelowy]
    if (command === 'unzip') {
        if (!args[0]) return message.reply('❌ Użycie: `!unzip <plik.zip> [katalog_docelowy]`');
        const zipFile = args[0];
        const destFolder = args[1] ? path.resolve(currentDir, args.slice(1).join(' ')) : currentDir;
        const fullZip = path.resolve(currentDir, zipFile);

        if (!fs.existsSync(fullZip)) return message.reply('❌ Wskazany plik ZIP nie istnieje.');

        const psScript = `Expand-Archive -Path '${fullZip.replace(/'/g, "''")}' -DestinationPath '${destFolder.replace(/'/g, "''")}' -Force`;
        runPowershell(psScript, (err) => {
            if (err) return message.reply(`❌ Błąd rozpakowywania: ${err.message}`);
            message.reply(`📂 Pomyślnie rozpakowano archiwum **\`${zipFile}\`** do:\n\`${destFolder}\``);
        });
        return;
    }

    // ====================================================
    // 7. SCREEN: !screenshot, !webcam (or !screen, !kamerka)
    // ====================================================

    // !screenshot / !screen
    if (command === 'screenshot' || command === 'screen') {
        const screenshotPath = path.join(os.tmpdir(), 'screenshot.jpg');
        try {
            await screenshot({ filename: screenshotPath });
            message.channel.send({
                content: "🖼️ Zrzut ekranu monitora:",
                files: [screenshotPath]
            }).catch(() => {
                message.reply("❌ Nie udało się wysłać zrzutu ekranu.");
            });
        } catch (err) {
            message.reply(`❌ Błąd przy zrzucie ekranu: ${err.message}`);
        }
        return;
    }

    // !webcam / !kamerka
    if (command === 'webcam' || command === 'kamerka') {
        const photoPath = path.join(os.tmpdir(), 'snapshot.jpg');
        const opts = {
            width: 1280,
            height: 720,
            quality: 100,
            saveShots: true,
            output: "jpeg",
            device: false,
            callbackReturn: "location",
            verbose: false
        };

        NodeWebcam.capture(photoPath, opts, function (err) {
            if (err) return message.reply("❌ Brak kamerki lub nie można przechwycić obrazu.");
            message.channel.send({
                content: "📸 Zdjęcie z kamerki:",
                files: [photoPath]
            }).catch(() => {
                message.reply("❌ Nie udało się wysłać zdjęcia z kamerki.");
            });
        });
        return;
    }

    // ====================================================
    // 8. AUDIO: !volume, !mute, !tts, media keys
    // ====================================================

    // !volume <0-100>
    if (command === 'volume') {
        const vol = parseInt(args[0], 10);
        if (isNaN(vol) || vol < 0 || vol > 100) {
            return message.reply('❌ Podaj poziom głośności od 0 do 100 (np. `!volume 40`).');
        }
        const steps = Math.round(vol / 2);
        const psScript = `
$w = New-Object -ComObject WScript.Shell
for ($i = 0; $i -lt 50; $i++) { $w.SendKeys([char]174) }
for ($i = 0; $i -lt ${steps}; $i++) { $w.SendKeys([char]175) }
`;
        runPowershell(psScript, () => {
            message.reply(`🔊 Ustawiono głośność systemu na: **${vol}%**`);
        });
        return;
    }

    // !mute
    if (command === 'mute') {
        exec('powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"', () => {
            message.reply('🔇 Przełączono wyciszenie dźwięku (Mute/Unmute).');
        });
        return;
    }

    // !tts <tekst>
    if (command === 'tts') {
        const text = args.join(' ');
        if (!text) return message.reply('❌ Podaj tekst: `!tts Cześć, co tam słychać?`');
        const sanitized = text.replace(/["`$\\]/g, ' ');
        const psCmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Speak('${sanitized}')"`;
        exec(psCmd, (err) => {
            if (err) message.reply(`❌ Błąd TTS: ${err.message}`);
            else message.reply(`🗣️ Przeczytano na głos na komputerze: "${text}"`);
        });
        return;
    }

    if (command === 'playpause' || command === 'play' || command === 'pause') {
        exec('powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"', () => {
            message.reply('⏯️ Przełączono odtwarzanie (Play/Pause).');
        });
        return;
    }

    if (command === 'next') {
        exec('powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]176)"', () => {
            message.reply('⏭️ Następny utwór.');
        });
        return;
    }

    if (command === 'prev') {
        exec('powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]177)"', () => {
            message.reply('⏮️ Poprzedni utwór.');
        });
        return;
    }

    // ====================================================
    // 9. BROWSER: !browser (and !otworz, !link)
    // ====================================================

    // !browser [url_lub_app]
    if (command === 'browser' || command === 'link') {
        const target = args.join(' ');
        if (!target) {
            exec('start https://www.google.com', (err) => {
                if (err) message.reply(`❌ Błąd: ${err.message}`);
                else message.reply('🌐 Otwarto przeglądarkę internetową.');
            });
        } else {
            const isUrl = target.includes('.') && !target.endsWith('.exe');
            let openTarget = target;
            if (isUrl && !target.startsWith('http://') && !target.startsWith('https://')) {
                openTarget = 'https://' + target;
            }
            exec(`start "" "${openTarget}"`, (err) => {
                if (err) message.reply(`❌ Błąd otwierania: ${err.message}`);
                else message.reply(`🚀 Otwarto: \`${openTarget}\``);
            });
        }
        return;
    }

    // !otworz <aplikacja>
    if (command === 'otworz') {
        const appName = args.join(' ');
        if (!appName) return message.reply("❌ Podaj nazwę aplikacji (np. `!otworz notepad`).");
        exec(`start "" "${appName}"`, (error) => {
            if (error) message.reply(`❌ Błąd uruchamiania: ${error.message}`);
            else message.reply(`✅ Uruchomiono \`${appName}\``);
        });
        return;
    }

    // ====================================================
    // 10. FUN: !rickroll, !matrix, !toast, !warning, !popup
    // ====================================================

    // !rickroll – Klasyczny żart
    if (command === 'rickroll') {
        exec('start https://www.youtube.com/watch?v=dQw4w9WgXcQ', (err) => {
            if (err) return message.reply(`❌ Błąd: ${err.message}`);
            message.reply('🕺 **Rickroll pomyślnie odpalony na komputerze!** 🎶 *Never Gonna Give You Up...*');
        });
        return;
    }

    // !matrix – Efekt zielonego deszczu cyfr w oknie CMD
    if (command === 'matrix') {
        const matrixBat = `start cmd /k "color 0a & title MATRIX EFFECT & for /l %i in () do @echo %random% %random% %random% %random% %random% %random% %random% %random% %random% %random%"`;
        exec(matrixBat, (err) => {
            if (err) return message.reply(`❌ Błąd: ${err.message}`);
            message.reply('🟩 **Wodospad kodu Matrix został uruchomiony na ekranie komputera!**');
        });
        return;
    }

    // !toast <tytuł | treść> lub <treść> – Powiadomienie Windows 10/11
    if (command === 'toast') {
        const fullText = args.join(' ') || 'Nowe powiadomienie z Discorda';
        let title = 'Discord Bot';
        let body = fullText;

        if (fullText.includes('|')) {
            const parts = fullText.split('|');
            title = parts[0].trim();
            body = parts.slice(1).join('|').trim();
        }

        const safeTitle = title.replace(/['"<>]/g, '');
        const safeBody = body.replace(/['"<>]/g, '');

        const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$template = '<toast><visual><binding template="ToastGeneric"><text>${safeTitle}</text><text>${safeBody}</text></binding></visual></toast>'
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show($toast)
`;
        runPowershell(psScript, (err) => {
            if (err) message.reply(`❌ Błąd wysyłania powiadomienia Toast: ${err.message}`);
            else message.reply(`🔔 **Wyświetlono powiadomienie Toast na ekranie:**\n*${safeTitle}*: "${safeBody}"`);
        });
        return;
    }

    // !warning <tekst> – Wyskakujące okienko z ostrzeżeniem i dźwiękiem alertu
    if (command === 'warning') {
        const text = args.join(' ') || 'Wykryto krytyczny alert systemowy!';
        const safeText = text.replace(/'/g, "''");
        const psScript = `
Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show('${safeText}', 'OSTRZEŻENIE SYSTEMOWE', 'OK', 'Warning')
`;
        runPowershell(psScript);
        message.reply(`⚠️ **Wyświetlono okno ostrzeżenia systemowego na ekranie komputera.**`);
        return;
    }

    // !popup <tekst> / !msg – Zwykłe okienko informacyjne MessageBox
    if (command === 'popup' || command === 'msg') {
        const text = args.join(' ');
        if (!text) return message.reply('❌ Podaj treść wiadomości: `!popup Treść wiadomości`');
        const safeText = text.replace(/'/g, "''");
        const psScript = `
Add-Type -AssemblyName PresentationFramework
[System.Windows.MessageBox]::Show('${safeText}', 'Wiadomość z Discorda', 'OK', 'Information')
`;
        runPowershell(psScript);
        message.reply(`💬 Wyświetlono okienko powiadomienia na ekranie.`);
        return;
    }

    // ====================================================
    // 11. SCHOWEK: !schowek, !kopiuj
    // ====================================================

    // !schowek
    if (command === 'schowek' || command === 'clip') {
        runPowershell("Get-Clipboard", (err, stdout) => {
            if (err) return message.reply(`❌ Błąd: ${err.message}`);
            if (!stdout) return message.reply('📋 Schowek Windows jest pusty.');
            const preview = stdout.length > 1900 ? stdout.slice(0, 1900) + '...' : stdout;
            message.reply(`📋 **Zawartość schowka:**\n\`\`\`\n${preview}\n\`\`\``);
        });
        return;
    }

    // !kopiuj <tekst>
    if (command === 'kopiuj') {
        const text = args.join(' ');
        if (!text) return message.reply('❌ Podaj tekst do skopiowania: `!kopiuj Twój tekst`');
        const child = exec('powershell -NoProfile -Command "$input | Set-Clipboard"', (err) => {
            if (err) return message.reply(`❌ Błąd: ${err.message}`);
            message.reply('📋 Tekst został pomyślnie skopiowany do schowka komputera.');
        });
        child.stdin.write(text);
        child.stdin.end();
        return;
    }

    // ====================================================
    // Fallback: Wykonywanie dowolnej komendy w CMD
    // ====================================================
    exec(input, { cwd: currentDir }, (error, stdout, stderr) => {
        if (error && !stdout && !stderr) {
            message.reply(`❌ Błąd:\n\`\`\`\n${error.message}\n\`\`\``);
            return;
        }

        let response = '';
        if (stdout) response += stdout;
        if (stderr) response += `\n[STDERR]\n${stderr}`;

        if (!response.trim()) {
            message.reply('✅ Polecenie wykonane (brak danych wyjściowych).');
            return;
        }

        const output = response.length > 1900 ? response.slice(0, 1900) + '\n... (obcięto)' : response;
        message.reply(`💻 **Wynik polecenia:**\n\`\`\`cmd\n${output}\n\`\`\``);
    });
});

const token = process.env.DISCORD_TOKEN || 'put_your_dc_bot_token_here';
client.login(token);
