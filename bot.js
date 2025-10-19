const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
    token: process.env.DISCORD_TOKEN || process.env.BOT_TOKEN,
    guildId: '1406416544451399832',
    adminRole: '1406420130044313772',
    ticketCategory: '1406418069181436017',
    transcriptChannel: '1406761652510134294',
    vouchChannel: '1429250208016896040'
};

// Clean color scheme
const COLORS = {
    PRIMARY: 0x5865F2,
    SUCCESS: 0x57F287,
    WARNING: 0xFEE75C,
    ERROR: 0xED4245,
    PREMIUM: 0xFF73FA
};

// Simple emojis
const EMOJIS = {
    TICKET: '🎫',
    LIMITEDS: '🎨',
    DAHOOD: '👕',
    SERVICES: '🛒',
    CHECK: '✅',
    CROSS: '❌',
    LOCK: '🔒',
    STAR: '⭐',
    SHIELD: '🛡️'
};

// Database class
class TicketDB {
    constructor() {
        this.filePath = path.join(__dirname, 'data', 'tickets.json');
        this.ensureFileExists();
    }

    ensureFileExists() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, JSON.stringify({ tickets: {}, counter: 0 }));
        }
    }

    read() { return JSON.parse(fs.readFileSync(this.filePath, 'utf8')); }
    write(data) { fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2)); }

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

const db = new TicketDB();
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Stores
const vouchSessions = new Map();
const securityMessages = new Map();

// Clean security warning
async function sendSecurityWarning() {
    try {
        const channel = await client.channels.fetch(config.ticketCategory);
        if (!channel) return;

        // Delete previous message
        const previousId = securityMessages.get(channel.id);
        if (previousId) {
            try {
                const prevMsg = await channel.messages.fetch(previousId);
                await prevMsg.delete();
            } catch {}
        }

        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.SHIELD} Security Notice`)
            .setDescription('**Important:** Staff will __never__ message you first. Beware of scammers in DMs claiming they "saw your ticket".')
            .setColor(COLORS.WARNING)
            .setTimestamp();

        const msg = await channel.send({ embeds: [embed] });
        securityMessages.set(channel.id, msg.id);
    } catch (error) {
        console.log('Security warning error:', error);
    }
}

// Clean transcript system
async function createTranscript(ticketData, messages) {
    try {
        const transcriptChannel = await client.channels.fetch(config.transcriptChannel);
        if (!transcriptChannel) return false;

        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.TICKET} Ticket #${ticketData.number}`)
            .setDescription(`**Service:** ${ticketData.description}`)
            .addFields(
                { name: 'Client', value: ticketData.userTag, inline: true },
                { name: 'Duration', value: `${Math.round((new Date(ticketData.closedAt) - new Date(ticketData.createdAt)) / 60000)}m`, inline: true },
                { name: 'Closed By', value: ticketData.closedBy, inline: true }
            )
            .setColor(COLORS.PRIMARY)
            .setTimestamp();

        let transcript = `Ticket #${ticketData.number}\nService: ${ticketData.description}\nClient: ${ticketData.userTag}\nClosed: ${ticketData.closedBy}\n\nMessages:\n`;
        
        Array.from(messages.values()).reverse().forEach(msg => {
            const time = new Date(msg.createdTimestamp).toLocaleTimeString();
            transcript += `[${time}] ${msg.author.tag}: ${msg.content}\n`;
        });

        await transcriptChannel.send({
            embeds: [embed],
            files: [{ attachment: Buffer.from(transcript, 'utf8'), name: `ticket-${ticketData.number}.txt` }]
        });

        return true;
    } catch (error) {
        console.log('Transcript error:', error);
        return false;
    }
}

// Clean ticket creation
async function createTicket(interaction, type, description) {
    try {
        const guild = interaction.guild;
        const member = interaction.member;

        // Check existing tickets
        const userTickets = await db.get(`tickets.${member.id}`) || [];
        const openTicket = userTickets.find(t => t.open);
        
        if (openTicket) {
            const embed = new EmbedBuilder()
                .setTitle(`${EMOJIS.CROSS} Existing Ticket`)
                .setDescription('You already have an open ticket. Please close it first.')
                .setColor(COLORS.ERROR);
            return await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // Create channel
        const ticketNumber = (await db.get('counter') || 0) + 1;
        const ticketChannel = await guild.channels.create({
            name: `ticket-${ticketNumber}`,
            type: ChannelType.GuildText,
            parent: config.ticketCategory,
            permissionOverwrites: [
                { id: guild.id, deny: [1024n] }, // VIEW_CHANNEL
                { id: member.id, allow: [1024n, 2048n] }, // VIEW_CHANNEL + SEND_MESSAGES
                { id: config.adminRole, allow: [1024n, 2048n, 65536n] } // + MANAGE_MESSAGES
            ]
        });

        // Save data
        const ticketData = {
            channelId: ticketChannel.id,
            userId: member.id,
            userTag: member.user.tag,
            type: type,
            description: description,
            open: true,
            createdAt: new Date().toISOString(),
            number: ticketNumber
        };
        
        await db.set(`tickets.${member.id}`, [...userTickets, ticketData]);
        await db.set('counter', ticketNumber);

        // Ticket message
        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.TICKET} Ticket #${ticketNumber}`)
            .setDescription(`**Service:** ${description}`)
            .addFields(
                { name: 'Client', value: `${member}`, inline: true },
                { name: 'Created', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
            )
            .setFooter({ text: 'Staff will assist you shortly.' })
            .setColor(COLORS.PRIMARY)
            .setTimestamp();

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji(EMOJIS.LOCK)
        );

        await ticketChannel.send({ 
            content: `${member} <@&${config.adminRole}>`,
            embeds: [embed], 
            components: [buttons] 
        });

        // Success response
        const successEmbed = new EmbedBuilder()
            .setTitle(`${EMOJIS.CHECK} Ticket Created`)
            .setDescription(`Your ticket has been created: ${ticketChannel}`)
            .setColor(COLORS.SUCCESS);

        await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
        console.error('Ticket creation error:', error);
        await interaction.editReply({ 
            content: `${EMOJIS.CROSS} Failed to create ticket. Please try again.` 
        });
    }
}

// Clean vouch system
async function sendVouchRequest(user, description, staffMember) {
    try {
        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.STAR} Rate Your Experience`)
            .setDescription(`How was your experience with **${description}**?`)
            .setColor(COLORS.PRIMARY)
            .setTimestamp();

        const dropdown = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('vouch_rating')
                .setPlaceholder('Select rating...')
                .addOptions([
                    { label: '5 Stars - Excellent', value: 'vouch_5', emoji: '⭐' },
                    { label: '4 Stars - Great', value: 'vouch_4', emoji: '⭐' },
                    { label: '3 Stars - Good', value: 'vouch_3', emoji: '⭐' },
                    { label: '2 Stars - Fair', value: 'vouch_2', emoji: '⭐' },
                    { label: '1 Star - Poor', value: 'vouch_1', emoji: '⭐' }
                ])
        );

        const dm = await user.send({ embeds: [embed], components: [dropdown] });
        vouchSessions.set(user.id, { description, staffMember, messageId: dm.id });
        return true;
    } catch (error) {
        return false;
    }
}

async function sendVouchToChannel(user, rating, description, comment = '') {
    try {
        const vouchChannel = await client.channels.fetch(config.vouchChannel);
        if (!vouchChannel) return false;

        const stars = '⭐'.repeat(rating);
        const embed = new EmbedBuilder()
            .setTitle('Customer Review')
            .setDescription(`**Rating:** ${rating}/5 ${stars}\n**Service:** ${description}`)
            .addFields(
                { name: 'User', value: user.tag, inline: true },
                { name: 'Time', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
            )
            .setColor(rating >= 4 ? COLORS.SUCCESS : rating >= 3 ? COLORS.WARNING : COLORS.ERROR)
            .setTimestamp();

        if (comment) embed.addFields({ name: 'Comment', value: comment });

        await vouchChannel.send({ embeds: [embed] });
        return true;
    } catch (error) {
        return false;
    }
}

// Bot ready event
client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} is online!`);
    
    // Register slash command
    try {
        const guild = await client.guilds.fetch(config.guildId);
        await guild.commands.set([{
            name: 'setup-tickets',
            description: 'Create the ticket panel'
        }]);
        console.log('✅ Slash command registered!');
    } catch (error) {
        console.log('Using message command as fallback');
    }

    // Start security system
    sendSecurityWarning();
    setInterval(sendSecurityWarning, 50 * 60 * 1000);
});

// Slash command handler
client.on('interactionCreate', async (interaction) => {
    try {
        // Slash command
        if (interaction.isChatInputCommand() && interaction.commandName === 'setup-tickets') {
            if (!interaction.memberPermissions.has('Administrator')) {
                return await interaction.reply({ content: '❌ Administrator permission required.', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle(`${EMOJIS.TICKET} Support Tickets`)
                .setDescription('Select a service below to create a ticket:')
                .addFields(
                    { name: `${EMOJIS.LIMITEDS} Limiteds`, value: 'Buy or sell limited items', inline: true },
                    { name: `${EMOJIS.DAHOOD} DaHood`, value: 'Buy or sell skins', inline: true },
                    { name: `${EMOJIS.SERVICES} Services`, value: 'Buying services', inline: true }
                )
                .setColor(COLORS.PRIMARY)
                .setFooter({ text: 'Staff will respond in your ticket channel.' })
                .setTimestamp();

            const dropdown = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_type')
                    .setPlaceholder('Choose a service...')
                    .addOptions([
                        { label: 'Limiteds', description: 'Buy or sell limited items', value: 'limiteds', emoji: EMOJIS.LIMITEDS },
                        { label: 'DaHood Skins', description: 'Buy or sell skins', value: 'dahood', emoji: EMOJIS.DAHOOD },
                        { label: 'Buying Services', description: 'Professional buying services', value: 'services', emoji: EMOJIS.SERVICES }
                    ])
            );

            await interaction.reply({ embeds: [embed], components: [dropdown] });
        }

        // Ticket type selection
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
            const type = interaction.values[0];
            if (type === 'services') {
                await createTicket(interaction, 'services', 'Buying Services');
            } else {
                const serviceName = type === 'limiteds' ? 'Limiteds' : 'DaHood Skins';
                const embed = new EmbedBuilder()
                    .setTitle(`Buy or Sell ${serviceName}`)
                    .setColor(COLORS.PRIMARY);

                const dropdown = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`action_${type}`)
                        .setPlaceholder('Choose action...')
                        .addOptions([
                            { label: `Buy ${serviceName}`, value: `buy_${type}`, emoji: '💰' },
                            { label: `Sell ${serviceName}`, value: `sell_${type}`, emoji: '💎' }
                        ])
                );

                await interaction.reply({ embeds: [embed], components: [dropdown], ephemeral: true });
            }
        }

        // Buy/sell selection
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('action_')) {
            const [action, type] = interaction.values[0].split('_');
            const serviceName = type === 'limiteds' ? 'Limiteds' : 'DaHood Skins';
            const description = `${action === 'buy' ? 'Buying' : 'Selling'} ${serviceName}`;
            await createTicket(interaction, `${action}-${type}`, description);
        }

        // Vouch system
        if (interaction.isStringSelectMenu() && interaction.customId === 'vouch_rating') {
            const rating = parseInt(interaction.values[0].split('_')[1]);
            const vouchData = vouchSessions.get(interaction.user.id);
            
            if (vouchData) {
                const modal = new ModalBuilder()
                    .setCustomId('vouch_comment')
                    .setTitle('Add Comment (Optional)');

                const input = new TextInputBuilder()
                    .setCustomId('comment')
                    .setLabel('Your feedback (optional)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(500);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal);

                vouchSessions.set(interaction.user.id, { ...vouchData, rating });
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'vouch_comment') {
            const comment = interaction.fields.getTextInputValue('comment');
            const vouchData = vouchSessions.get(interaction.user.id);
            
            if (vouchData?.rating) {
                await sendVouchToChannel(interaction.user, vouchData.rating, vouchData.description, comment);
                vouchSessions.delete(interaction.user.id);

                const embed = new EmbedBuilder()
                    .setTitle(`${EMOJIS.CHECK} Thank You!`)
                    .setDescription('Your feedback has been recorded.')
                    .setColor(COLORS.SUCCESS);

                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
        }

        // Close ticket
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            const embed = new EmbedBuilder()
                .setTitle('Close Ticket')
                .setDescription('Are you sure? This will send a feedback request to the user.')
                .setColor(COLORS.WARNING);

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_close').setLabel('Confirm').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_close').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: true });
        }

        if (interaction.isButton() && interaction.customId === 'confirm_close') {
            await interaction.deferUpdate();
            
            const data = db.read();
            let ticket = null;
            let userId = null;

            for (const uid in data.tickets) {
                const userTickets = data.tickets[uid];
                const t = userTickets.find(t => t.channelId === interaction.channel.id && t.open);
                if (t) { ticket = t; userId = uid; break; }
            }
            
            if (ticket) {
                // Create transcript
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                await createTranscript(ticket, Array.from(messages.values()));
                
                // Send vouch request
                const user = await client.users.fetch(userId);
                await sendVouchRequest(user, ticket.description, interaction.user.tag);

                // Update ticket
                ticket.open = false;
                ticket.closedAt = new Date().toISOString();
                ticket.closedBy = interaction.user.tag;
                await db.set(`tickets.${userId}`, data.tickets[userId]);

                // Close message
                const embed = new EmbedBuilder()
                    .setTitle(`${EMOJIS.LOCK} Ticket Closed`)
                    .setDescription('This channel will be deleted shortly.')
                    .setColor(COLORS.SUCCESS);

                await interaction.channel.send({ embeds: [embed] });
                setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
            }
        }

        if (interaction.isButton() && interaction.customId === 'cancel_close') {
            await interaction.update({ content: 'Cancelled.', components: [] });
        }

    } catch (error) {
        console.error('Interaction error:', error);
        try {
            await interaction.reply({ content: 'An error occurred.', ephemeral: true });
        } catch {}
    }
});

// Fallback message command
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    if (message.content === '!setup-tickets' && message.member.permissions.has('Administrator')) {
        const embed = new EmbedBuilder()
            .setTitle(`${EMOJIS.TICKET} Support Tickets`)
            .setDescription('Use `/setup-tickets` for the slash command version!')
            .setColor(COLORS.PRIMARY);

        await message.reply({ embeds: [embed] });
    }
});

client.login(config.token);