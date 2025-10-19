const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Premium configuration
const config = {
    token: process.env.DISCORD_TOKEN || process.env.BOT_TOKEN,
    guildId: '1406416544451399832',
    adminRole: '1406420130044313772',
    ticketCategory: '1406418069181436017',
    transcriptChannel: '1406761652510134294',
    vouchChannel: '1429250208016896040'
};

// Premium color scheme
const COLORS = {
    PRIMARY: 0x5865F2,
    SUCCESS: 0x57F287,
    WARNING: 0xFEE75C,
    ERROR: 0xED4245,
    PREMIUM: 0xFF73FA,
    DARK: 0x2B2D31
};

const EMOJIS = {
    LIMITEDS: '<:lim:1429231822646018149>',
    DAHOOD: '<:dh:1429232221683712070>',
    SERVICES: '<:discord:1429232874338652260>',
    CHECKMARK: '<:checkmark:1406769918866620416>',
    PREMIUM: '💎',
    SHIELD: '🛡️',
    MONEY: '💰',
    STAR: '⭐'
};

class PremiumDB {
    constructor() {
        this.filePath = path.join(__dirname, 'data', 'tickets.json');
        this.ensureFileExists();
    }

    ensureFileExists() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, JSON.stringify({ tickets: {}, counter: 0, settings: {} }));
        }
    }

    read() {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    }

    write(data) {
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    }

    async get(key) {
        const data = this.read();
        return key.split('.').reduce((obj, k) => obj?.[k], data);
    }

    async set(key, value) {
        const data = this.read();
        const keys = key.split('.');
        let obj = data;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!obj[keys[i]]) obj[keys[i]] = {};
            obj = obj[keys[i]];
        }
        
        obj[keys[keys.length - 1]] = value;
        this.write(data);
    }
}

const db = new PremiumDB();
const client = new Client({
    intents: Object.values(GatewayIntentBits)
});

// Store active components
const vouchSessions = new Map();
const securityMessages = new Map();

// Premium security warning system
async function sendSecurityWarning() {
    try {
        const channel = await client.channels.fetch(config.ticketCategory);
        if (!channel) return;

        // Delete previous security messages
        const previousMessageId = securityMessages.get(channel.id);
        if (previousMessageId) {
            try {
                const previousMessage = await channel.messages.fetch(previousMessageId);
                await previousMessage.delete();
            } catch (error) {
                // Message might already be deleted
            }
        }

        const securityEmbed = new EmbedBuilder()
            .setTitle(`${EMOJIS.SHIELD} **SECURITY ALERT** ${EMOJIS.SHIELD}`)
            .setDescription('**⚠️ IMPORTANT SECURITY NOTICE ⚠️**')
            .addFields(
                {
                    name: '🚫 **STAFF WILL NEVER MESSAGE YOU FIRST**',
                    value: 'After you create a ticket, our staff will __**NEVER**__ message you directly. Do not trust anyone claiming they can help you outside of this ticket system.',
                    inline: false
                },
                {
                    name: '🔍 **WATCH OUT FOR SCAMMERS**',
                    value: 'Do not trust anybody claiming they:\n• "SAW YOUR TICKET"\n• Can "SEE" your ticket\n• Offer "QUICK HELP" in DMs\n\n**These are __SCAMMERS__ trying to steal from you!**',
                    inline: false
                },
                {
                    name: '✅ **LEGITIMATE STAFF**',
                    value: '• Will only respond in your ticket channel\n• Have official staff roles\n• Will never ask for your password\n• Use our official bot system',
                    inline: false
                }
            )
            .setColor(COLORS.WARNING)
            .setThumbnail('https://media.discordapp.net/attachments/1429234159674593352/1429235801782489160/romels_stock_banner1.png')
            .setFooter({ text: 'Romel\'s Stock • Premium Security • Stay Safe', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const message = await channel.send({ embeds: [securityEmbed] });
        securityMessages.set(channel.id, message.id);
        
    } catch (error) {
        console.error('Error sending security warning:', error);
    }
}

// Premium transcript system (text-only)
async function createTranscript(ticketData, messages) {
    try {
        // Create a beautiful transcript embed
        const transcriptEmbed = new EmbedBuilder()
            .setTitle(`📄 Premium Transcript #${ticketData.number}`)
            .setDescription(`**Service:** ${ticketData.description}\n**Client:** ${ticketData.userTag}\n**Duration:** ${Math.round((new Date(ticketData.closedAt) - new Date(ticketData.createdAt)) / 60000)} minutes`)
            .addFields(
                { name: '🕒 Opened', value: `<t:${Math.floor(new Date(ticketData.createdAt).getTime()/1000)}:F>`, inline: true },
                { name: '🕒 Closed', value: `<t:${Math.floor(new Date(ticketData.closedAt).getTime()/1000)}:F>`, inline: true },
                { name: '🔧 Closed By', value: ticketData.closedBy, inline: true },
                { name: '💎 Service Type', value: ticketData.description, inline: false }
            )
            .setColor(COLORS.PREMIUM)
            .setThumbnail('https://media.discordapp.net/attachments/1429234159674593352/1429235801782489160/romels_stock_banner1.png')
            .setFooter({ text: 'Romel\'s Stock • Premium Transcript', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        // Create formatted text transcript
        let transcriptText = `💎 ROMEL'S STOCK - PREMIUM TICKET TRANSCRIPT #${ticketData.number}\n`;
        transcriptText += `═`.repeat(60) + '\n\n';
        transcriptText += `Service: ${ticketData.description}\n`;
        transcriptText += `Client: ${ticketData.userTag} (${ticketData.userId})\n`;
        transcriptText += `Opened: ${new Date(ticketData.createdAt).toLocaleString()}\n`;
        transcriptText += `Closed: ${new Date(ticketData.closedAt).toLocaleString()}\n`;
        transcriptText += `Closed By: ${ticketData.closedBy}\n`;
        transcriptText += `Duration: ${Math.round((new Date(ticketData.closedAt) - new Date(ticketData.createdAt)) / 60000)} minutes\n\n`;
        transcriptText += `═`.repeat(60) + '\n\n';
        transcriptText += `MESSAGE HISTORY:\n`;
        transcriptText += `═`.repeat(60) + '\n\n';

        // Add messages to transcript (reverse to show chronological order)
        const sortedMessages = Array.from(messages.values()).reverse();
        sortedMessages.forEach(msg => {
            const timestamp = new Date(msg.createdTimestamp).toLocaleTimeString();
            const author = msg.author.bot ? `🤖 ${msg.author.tag}` : `👤 ${msg.author.tag}`;
            transcriptText += `[${timestamp}] ${author}: ${msg.content || ''}\n`;
            
            // Add attachments
            if (msg.attachments.size > 0) {
                transcriptText += `📎 Attachments: ${msg.attachments.map(a => a.url).join(', ')}\n`;
            }
            
            // Add embeds
            if (msg.embeds.length > 0) {
                transcriptText += `📊 Embeds: ${msg.embeds.length} embed(s)\n`;
            }
            
            transcriptText += '\n';
        });

        transcriptText += `═`.repeat(60) + '\n';
        transcriptText += `💎 END OF TRANSCRIPT • ROMEL'S STOCK PREMIUM SERVICE 💎\n`;

        // Send to transcript channel
        const transcriptChannel = await client.channels.fetch(config.transcriptChannel);
        if (transcriptChannel) {
            await transcriptChannel.send({
                embeds: [transcriptEmbed],
                files: [{
                    attachment: Buffer.from(transcriptText, 'utf8'),
                    name: `premium-transcript-${ticketData.number}.txt`
                }]
            });
        }

        return true;
    } catch (error) {
        console.error('Error creating transcript:', error);
        return false;
    }
}

// Premium ticket creation (same as before, just removed canvas references)
async function createPremiumTicket(interaction, type, description) {
    try {
        const guild = interaction.guild;
        const member = interaction.member;
        
        // Check for existing tickets
        const userTickets = await db.get(`tickets.${member.id}`) || [];
        const openTicket = userTickets.find(ticket => ticket.open);
        
        if (openTicket) {
            try {
                const channel = await guild.channels.fetch(openTicket.channelId);
                if (channel) {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle(`${EMOJIS.ERROR} Already Have Open Ticket`)
                        .setDescription(`You already have an active ticket: ${channel}\n\nPlease close it before creating a new one.`)
                        .setColor(COLORS.ERROR)
                        .setTimestamp();

                    return await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            } catch (error) {
                await db.set(`tickets.${member.id}`, []);
            }
        }

        // Premium loading message
        const loadingEmbed = new EmbedBuilder()
            .setTitle(`${EMOJIS.PREMIUM} Creating Premium Ticket...`)
            .setDescription('Setting up your exclusive support channel')
            .setColor(COLORS.PREMIUM)
            .setThumbnail('https://media.discordapp.net/attachments/1429234159674593352/1429235801782489160/romels_stock_banner1.png')
            .setTimestamp();

        await interaction.reply({ embeds: [loadingEmbed], ephemeral: true });

        // Create premium ticket channel
        const ticketNumber = (await db.get('counter') || 0) + 1;
        const ticketChannel = await guild.channels.create({
            name: `🎫・ticket-${ticketNumber}`,
            type: ChannelType.GuildText,
            parent: config.ticketCategory,
            permissionOverwrites: [
                { id: guild.id, deny: [BigInt(0x0000000000000400)] },
                { id: member.id, allow: [BigInt(0x0000000000000400), BigInt(0x0000000000000800)] },
                { id: config.adminRole, allow: [BigInt(0x0000000000000400), BigInt(0x0000000000000800), BigInt(0x0000000000010000)] }
            ]
        });

        // Save premium ticket data
        const ticketData = {
            channelId: ticketChannel.id,
            userId: member.id,
            userTag: member.user.tag,
            type: type,
            description: description,
            open: true,
            createdAt: new Date().toISOString(),
            number: ticketNumber,
            openedBy: member.user.tag
        };
        
        const currentTickets = await db.get(`tickets.${member.id}`) || [];
        currentTickets.push(ticketData);
        await db.set(`tickets.${member.id}`, currentTickets);
        await db.set('counter', ticketNumber);

        // Premium ticket embed
        const ticketEmbed = new EmbedBuilder()
            .setTitle(`${EMOJIS.PREMIUM} Premium Ticket #${ticketNumber}`)
            .setDescription(`**Welcome to your exclusive support channel!**`)
            .addFields(
                { name: `${EMOJIS.MONEY} Service`, value: description, inline: true },
                { name: `${EMOJIS.STAR} Client`, value: `${member}`, inline: true },
                { name: '🕒 Created', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true },
                { name: `${EMOJIS.SHIELD} Security Notice`, value: 'Staff will **NEVER** message you first. Beware of scammers in DMs!', inline: false }
            )
            .setColor(COLORS.PREMIUM)
            .setImage('https://media.discordapp.net/attachments/1429234159674593352/1429235801782489160/romels_stock_banner1.png')
            .setFooter({ text: 'Romel\'s Stock • Premium Service • Stay Safe', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

        const ticketButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒'),
                new ButtonBuilder()
                    .setCustomId('add_member')
                    .setLabel('Add Member')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('👥')
            );

        await ticketChannel.send({ 
            content: `${member} <@&${config.adminRole}>`,
            embeds: [ticketEmbed], 
            components: [ticketButtons] 
        });

        // Premium success message
        const successEmbed = new EmbedBuilder()
            .setTitle(`${EMOJIS.CHECKMARK} Premium Ticket Created!`)
            .setDescription(`**Channel:** ${ticketChannel}\n**Service:** ${description}\n\nOur premium team will assist you shortly.`)
            .setColor(COLORS.SUCCESS)
            .setTimestamp();

        await interaction.editReply({ embeds: [successEmbed] });

        return ticketChannel;
    } catch (error) {
        console.error('Error creating premium ticket:', error);
        await interaction.editReply({ 
            content: `${EMOJIS.ERROR} Failed to create premium ticket. Please try again.`, 
            embeds: [] 
        });
    }
}

// [Rest of the functions remain the same - they don't use canvas]
// Premium vouch system, interaction handlers, etc. remain identical

client.once('ready', () => {
    console.log(`💎 ${client.user.tag} is online! Premium service activated!`);
    client.user.setPresence({
        activities: [{ name: 'discord.gg/romel | Premium Service', type: 3 }],
        status: 'online'
    });

    // Send initial security warning and set up interval
    sendSecurityWarning();
    setInterval(sendSecurityWarning, 50 * 60 * 1000); // Every 50 minutes
});

// [Rest of the interaction handlers and message handlers remain exactly the same]
// Only removed canvas-related code

client.login(config.token);