const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
    ],
});

// Конфигурация
const TOKEN = 'DISCORD_TOKEN';
const TEACHER_ID = 'TEACHER_ID';
const ROLE_NAME = 'Ученик на преподавател 1';
const INVITE_FILE = 'trackedInviteCode.json';
let trackedInviteCode = null;
let trackedGuildId = null;

// Собствена структура за кеширане на използванията на покани
const inviteUsesCache = new Map();

// Зареждаме запазения код на поканата при старт
if (fs.existsSync(INVITE_FILE)) {
    const data = fs.readFileSync(INVITE_FILE);
    const savedData = JSON.parse(data);
    trackedInviteCode = savedData.code;
    trackedGuildId = savedData.guildId;
    console.log(`Зареден код на покана: ${trackedInviteCode} за сървър: ${trackedGuildId}`);
}

client.once('ready', async () => {
    console.log('Ботът е готов!');
    for (const guild of client.guilds.cache.values()) {
        try {
            const guildInvites = await guild.invites.fetch();
            guildInvites.forEach(invite => {
                inviteUsesCache.set(`${guild.id}-${invite.code}`, invite.uses);
            });
            console.log(`Кеширани ${guildInvites.size} покани за сървър ${guild.name}`);
        } catch (err) {
            console.error(`Грешка при зареждане на покани за ${guild.name}:`, err);
        }
    }
});

client.on('inviteCreate', async invite => {
    inviteUsesCache.set(`${invite.guild.id}-${invite.code}`, invite.uses || 0);
    console.log(`Нова покана създадена: ${invite.code} с ${invite.uses || 0} използвания`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content.startsWith('!private')) {
        const user = message.mentions.users.first();
        if (!user) return message.reply('Моля, спомени потребител с @!');

        const guild = message.guild;
        const channel = await guild.channels.create({
            name: `private-${teacher.Used.username}-${user.username}`,
            type: 0,
            permissionOverwrites: [
                { id: guild.id, deny: ['ViewChannel'] },
                { id: message.author.id, allow: ['ViewChannel', 'SendMessages'] },
                { id: user.id, allow: ['ViewChannel', 'SendMessages'] },
                { id: client.user.id, allow: ['ViewChannel', 'SendMessages'] }
            ],
        });
        channel.send(`Здравей, ${user}! Това е нашият private чат с ${message.author}.`);
        message.reply(`Създадох private чат: ${channel}`);
    }

    if (message.content === '!generate-invite') {
        if (!message.member.permissions.has('CreateInstantInvite')) {
            return message.reply('Нямаш права да създаваш покани!');
        }

        try {
            const invite = await message.channel.createInvite({
                maxAge: 0,
                maxUses: 0,
                unique: true,
            });

            inviteUsesCache.set(`${message.guild.id}-${invite.code}`, invite.uses || 0);
            trackedInviteCode = invite.code;
            trackedGuildId = message.guild.id;
            fs.writeFileSync(INVITE_FILE, JSON.stringify({ code: trackedInviteCode, guildId: trackedGuildId }));

            console.log(`Създадох линк: ${invite.url}`);
            message.reply(`Ето линк: ${invite.url}\nВсеки, който влезе чрез този линк, ще получи ролята "${ROLE_NAME}".`);
        } catch (err) {
            console.error('Грешка при създаване на покана:', err);
            message.reply('Не можах да създам покана. Провери правата ми!');
        }
    }

    if (message.content === '!list-invites') {
        try {
            const invites = await message.guild.invites.fetch();
            if (invites.size === 0) {
                return message.reply('Няма активни покани в сървъра.');
            }
            const inviteList = invites.map(invite => `${invite.url} (Код: ${invite.code}, Използвания: ${invite.uses})`).join('\n');
            message.reply(`Активни покани:\n${inviteList}`);
        } catch (err) {
            console.error('Грешка при извличане на покани:', err);
            message.reply('Не можах да извлека поканите. Провери правата ми!');
        }
    }
});

client.on('guildMemberAdd', async member => {
    const guild = member.guild;

    if (trackedGuildId && guild.id !== trackedGuildId) {
        console.log(`Потребителят ${member.user.tag} се присъедини към друг сървър`);
        return;
    }

    try {
        const newInvites = await guild.invites.fetch();
        console.log(`Нова покана използвана от ${member.user.username}`);

        let usedInviteCode = null;
        for (const [code, invite] of newInvites) {
            const cacheKey = `${guild.id}-${code}`;
            const cachedUses = inviteUsesCache.get(cacheKey) || 0;
            console.log(`Покана ${code}: кеш ${cachedUses} -> ново ${invite.uses}`);
            if (invite.uses > cachedUses) {
                usedInviteCode = code;
                inviteUsesCache.set(cacheKey, invite.uses);
                break;
            }
        }

        console.log(`Used invite: ${usedInviteCode || 'undefined'}, Tracked: ${trackedInviteCode}`);

        if (usedInviteCode === trackedInviteCode) {
            const role = guild.roles.cache.find(r => r.name === ROLE_NAME);
            if (role) {
                await member.roles.add(role);
                console.log(`Добавих ролята "${ROLE_NAME}" на ${member.user.tag}`);
            } else {
                console.log(`Ролята "${ROLE_NAME}" не е намерена!`);
            }
        } else {
            console.log(`Потребителят не е използвал следената покана.`);
        }

        // Обновяваме кеша за всички покани
        newInvites.forEach(invite => {
            inviteUsesCache.set(`${guild.id}-${invite.code}`, invite.uses);
        });
    } catch (err) {
        console.error(`Грешка при обработка на нов потребител: ${member.user.tag}`, err);
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const role = newMember.guild.roles.cache.find(r => r.name === ROLE_NAME);
    if (!role) return;

    const hadRoleBefore = oldMember.roles.cache.has(role.id);
    const hasRoleNow = newMember.roles.cache.has(role.id);

    if (!hadRoleBefore && hasRoleNow) {
        try {
            const teacher = await newMember.guild.members.fetch(TEACHER_ID);
            const channel = await newMember.guild.channels.create({
                name: `${newMember.user.username}`,
                type: 0,
                permissionOverwrites: [
                    { id: newMember.guild.id, deny: ['ViewChannel'] },
                    { id: teacher.id, allow: ['ViewChannel', 'SendMessages'] },
                    { id: newMember.id, allow: ['ViewChannel', 'SendMessages'] },
                    { id: client.user.id, allow: ['ViewChannel', 'SendMessages'] }
                ],
            });
            channel.send(`Здравей, ${newMember}! Това е нашият приватен чат с ${teacher.user.username}.`);
        } catch (err) {
            console.error(`Грешка при създаване на канал за ${newMember.user.tag}:`, err);
        }
    }
});

client.login(TOKEN);