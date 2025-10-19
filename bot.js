const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, REST, Routes, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Simple JSON database for tickets
class TicketDB {
    constructor() {
        this.filePath = path.join(__dirname, 'tickets.json');
        this.ensureFileExists();
    }

    ensureFileExists() {
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, JSON.stringify({ tickets: {}, counter: 0 }));
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

    async getNextTicketNumber() {
        const counter = (await this.get('counter') || 0) + 1;
        await this.set('counter', counter);
        return counter;
    }
}

const db = new TicketDB();

// Config
const config = {
    token: process.env.BOT_TOKEN,
    guildId: '1406416544451399832',
    adminRole: '1406420130044313772',
    ticketsChannel: '1406418069181436017',
    vouchChannel: '1429250208016896040',
    transcriptChannel: '1406761652510134294'
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// Store for vouch data
const vouchSessions = new Map();
let antiScamMessageId = null;

// Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('setup-tickets')
        .setDescription('Create the ticket panel (Admin only)'),
    
    new SlashCommandBuilder()
        .setName('reset-tickets')
        .setDescription('Reset all ticket data (Staff only)'),
    
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency')
].map(command => command.toJSON());

// Register slash commands
async function registerSlashCommands() {
    try {
        const rest = new REST({ version: '10' }).setToken(config.token);
        console.log('🔄 Registering slash commands...');
        
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, config.guildId),
            { body: commands }
        );
        
        console.log('✅ Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Generate HTML transcript
function generateHTMLTranscript(ticketData, messages) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ticket #${ticketData.number} - Romel's Stock</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: #2c3e50;
            color: white;
            padding: 25px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 24px;
        }
        .ticket-info {
            background: #ecf0f1;
            padding: 20px;
            border-bottom: 1px solid #bdc3c7;
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        .info-item {
            background: white;
            padding: 12px;
            border-radius: 6px;
            border-left: 4px solid #3498db;
        }
        .info-label {
            font-size: 12px;
            color: #7f8c8d;
            margin-bottom: 5px;
        }
        .info-value {
            font-size: 14px;
            font-weight: 600;
        }
        .messages {
            padding: 20px;
        }
        .message {
            margin-bottom: 16px;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 6px;
            border-left: 3px solid #3498db;
        }
        .message-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        .user {
            font-weight: 600;
            color: #2c3e50;
        }
        .timestamp {
            color: #7f8c8d;
            font-size: 12px;
        }
        .message-content {
            color: #2c3e50;
            line-height: 1.4;
        }
        .footer {
            background: #34495e;
            color: white;
            text-align: center;
            padding: 15px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Ticket #${ticketData.number} - Romel's Stock</h1>
        </div>
        
        <div class="ticket-info">
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Service</div>
                    <div class="info-value">${ticketData.description}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Client</div>
                    <div class="info-value">${ticketData.userTag}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Ticket ID</div>
                    <div class="info-value">#${ticketData.number}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Status</div>
                    <div class="info-value">Completed</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Duration</div>
                    <div class="info-value">${Math.round((new Date() - new Date(ticketData.createdAt)) / 60000)} minutes</div>
                </div>
            </div>
        </div>
        
        <div class="messages">
            <h3 style="margin-bottom: 15px; color: #2c3e50;">Conversation</h3>
            ${messages.map(msg => `
                <div class="message">
                    <div class="message-header">
                        <span class="user">${msg.author}</span>
                        <span class="timestamp">${new Date(msg.timestamp).toLocaleString()}</span>
                    </div>
                    <div class="message-content">${msg.content || '[No content]'}</div>
                </div>
            `).join('')}
        </div>
        
        <div class="footer">
            Generated by Romel's Stock Bot • ${new Date().toLocaleDateString()}
        </div>
    </div>
</body>
</html>`;
    return html;
}

// Collect messages for transcript
async function collectTranscript(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcriptMessages = [];
        
        messages.reverse().forEach(message => {
            transcriptMessages.push({
                author: message.author.tag,
                content: message.content || '[No text content]',
                timestamp: message.createdAt.toISOString()
            });
        });
        
        return transcriptMessages;
    } catch (error) {
        console.log('Error collecting transcript:', error);
        return [];
    }
}

// Send transcript to logs
async function sendTranscript(ticketData, transcriptMessages) {
    try {
        const logChannel = await client.channels.fetch(config.transcriptChannel);
        if (!logChannel) return false;

        // Generate HTML transcript
        const htmlTranscript = generateHTMLTranscript(ticketData, transcriptMessages);
        const buffer = Buffer.from(htmlTranscript, 'utf-8');
        
        const transcriptEmbed = new EmbedBuilder()
            .setTitle(`📜 Ticket #${ticketData.number} Transcript`)
            .setDescription(`**Service:** ${ticketData.description}\n**Client:** ${ticketData.userTag}\n**Duration:** ${Math.round((new Date() - new Date(ticketData.createdAt)) / 60000)} minutes`)
            .setColor(0x3498db)
            .setTimestamp();

        await logChannel.send({
            embeds: [transcriptEmbed],
            files: [{
                attachment: buffer,
                name: `ticket-${ticketData.number}-transcript.html`
            }]
        });
        
        console.log(`✅ Transcript sent for ticket #${ticketData.number}`);
        return true;
    } catch (error) {
        console.log('Error sending transcript:', error);
        return false;
    }
}

// Anti-scam message system
async function sendAntiScamMessage() {
    try {
        const channel = await client.channels.fetch(config.ticketsChannel);
        if (!channel) return;

        // Delete previous anti-scam message
        if (antiScamMessageId) {
            try {
                const oldMessage = await channel.messages.fetch(antiScamMessageId);
                await oldMessage.delete();
            } catch (error) {
                // Message already deleted or not found
            }
        }

        const scamEmbed = new EmbedBuilder()
            .setTitle('🚨 **SECURITY WARNING** 🚨')
            .setDescription('**Staff will __NEVER MESSAGE YOU__ after you create a ticket.**\n\n**Do not trust anybody claiming they __"SAW YOUR TICKET"__ or can __"SEE"__ your ticket, they\'re __SCAMMERS__**\n\n• Only trust staff in your ticket channel\n• Never share personal information in DMs\n• Report suspicious users immediately')
            .setColor(0xFF0000)
            .setThumbnail('https://media.discordapp.net/attachments/1429234159674593352/1429235801782489160/romels_stock_banner1.png')
            .setFooter({ text: 'Romel\'s Stock • Security System' })
            .setTimestamp();

        const message = await channel.send({ embeds: [scamEmbed] });
        antiScamMessageId = message.id;
        
        console.log('✅ Anti-scam message updated');
    } catch (error) {
        console.log('Error sending anti-scam message:', error);
    }
}

// Start anti-scam loop
function startAntiScamMessages() {
    sendAntiScamMessage();
    setInterval(sendAntiScamMessage, 50 * 60 * 1000);
}

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} is online!`);
    
    client.user.setPresence({
        activities: [{ name: 'discord.gg/romel', type: 3 }],
        status: 'online'
    });

    await registerSlashCommands();
    startAntiScamMessages();
});

// Ticket creation with transcript tracking
async function createTicket(interaction, description) {
    try {
        const guild = interaction.guild;
        const member = interaction.member;

        const loadingEmbed = new EmbedBuilder()
            .setTitle('Creating your ticket...')
            .setDescription('Setting up your support channel')
            .setColor(0x3498db)
            .setTimestamp();

        await interaction.reply({ 
            embeds: [loadingEmbed], 
            ephemeral: true 
        });

        const ticketNumber = await db.getNextTicketNumber();
        const ticketChannel = await guild.channels.create({
            name: `ticket-${ticketNumber}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.id, deny: [BigInt(0x0000000000000400)] },
                { id: member.id, allow: [BigInt(0x0000000000000400), BigInt(0x0000000000000800)] },
                { id: config.adminRole, allow: [BigInt(0x0000000000000400), BigInt(0x0000000000000800)] }
            ]
        });

        // Save ticket data for transcript
        const ticketData = {
            channelId: ticketChannel.id,
            userId: member.id,
            userTag: member.user.tag,
            description: description,
            number: ticketNumber,
            createdAt: new Date().toISOString(),
            openedBy: member.user.tag
        };

        const ticketEmbed = new EmbedBuilder()
            .setTitle(`🎫 Ticket #${ticketNumber}`)
            .setDescription(`**Service:** ${description}\n**Client:** ${member}\n**Created:** <t:${Math.floor(Date.now()/1000)}:R>`)
            .addFields(
                { 
                    name: 'Getting Started', 
                    value: 'Please provide details about what you need. Our team will assist you shortly.' 
                },
                { 
                    name: '🚨 Security Notice', 
                    value: 'Staff will **NEVER** DM you first. Only trust messages in this ticket channel.' 
                }
            )
            .setColor(0x3498db)
            .setFooter({ text: 'Romel\'s Stock • Secure Support' })
            .setTimestamp();

        const ticketButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('Close Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒')
            );

        await ticketChannel.send({ 
            content: `${member} <@&${config.adminRole}>`, 
            embeds: [ticketEmbed], 
            components: [ticketButtons] 
        });

        const successEmbed = new EmbedBuilder()
            .setTitle('Ticket Created')
            .setDescription(`**Channel:** ${ticketChannel}\n**Service:** ${description}\n\nStaff will assist you shortly.`)
            .setColor(0x27ae60)
            .setTimestamp();

        await interaction.editReply({ 
            embeds: [successEmbed] 
        });

        return { channel: ticketChannel, data: ticketData };

    } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.editReply({ 
            content: 'Failed to create ticket. Please try again.', 
            embeds: [] 
        });
    }
}

// Improved vouch system
async function sendVouchRequest(user, ticketDescription, staffMember) {
    try {
        const vouchEmbed = new EmbedBuilder()
            .setTitle('How was your experience?')
            .setDescription(`Thank you for using Romel's Stock for **${ticketDescription}**.\n\nYour feedback helps us improve our service.`)
            .addFields(
                { 
                    name: 'Service Details', 
                    value: `**Service:** ${ticketDescription}\n**Completed by:** ${staffMember || 'Our Team'}` 
                }
            )
            .setColor(0x3498db)
            .setFooter({ text: 'Romel\'s Stock' })
            .setTimestamp();

        const vouchDropdown = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('vouch_rating')
                    .setPlaceholder('Select your rating...')
                    .addOptions([
                        {
                            label: '5 Stars - Excellent',
                            description: 'Perfect service experience',
                            value: 'vouch_5',
                            emoji: '⭐'
                        },
                        {
                            label: '4 Stars - Great',
                            description: 'Very good service',
                            value: 'vouch_4',
                            emoji: '⭐'
                        },
                        {
                            label: '3 Stars - Good',
                            description: 'Solid service',
                            value: 'vouch_3',
                            emoji: '⭐'
                        },
                        {
                            label: '2 Stars - Fair',
                            description: 'Could be better',
                            value: 'vouch_2',
                            emoji: '⭐'
                        },
                        {
                            label: '1 Star - Poor',
                            description: 'Needs improvement',
                            value: 'vouch_1',
                            emoji: '⭐'
                        }
                    ])
            );

        await user.send({ 
            embeds: [vouchEmbed], 
            components: [vouchDropdown] 
        });
        
        return true;
    } catch (error) {
        console.log('Could not send vouch request:', error);
        return false;
    }
}

async function sendVouchToChannel(user, rating, ticketDescription, comment = '') {
    try {
        const vouchChannel = await client.channels.fetch(config.vouchChannel);
        if (!vouchChannel) return false;
        
        const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
        const ratingColor = rating === 5 ? 0x27ae60 : 
                          rating === 4 ? 0x2ecc71 : 
                          rating === 3 ? 0xf39c12 : 
                          rating === 2 ? 0xe67e22 : 0xe74c3c;

        const vouchEmbed = new EmbedBuilder()
            .setTitle('Customer Review')
            .setDescription(`**Rating:** ${rating}/5 ${stars}\n**Service:** ${ticketDescription}`)
            .addFields(
                { name: 'Reviewed By', value: `${user.tag}`, inline: true },
                { name: 'Time', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true }
            )
            .setColor(ratingColor)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: 'Romel\'s Stock • Customer Feedback' })
            .setTimestamp();

        if (comment) {
            vouchEmbed.addFields({
                name: 'Comment',
                value: comment
            });
        }

        await vouchChannel.send({ embeds: [vouchEmbed] });
        return true;
    } catch (error) {
        console.log('Could not send vouch to channel:', error);
        return false;
    }
}

// Slash Command Handler
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            switch (interaction.commandName) {
                case 'setup-tickets':
                    if (!interaction.member.permissions.has('Administrator')) {
                        return await interaction.reply({ 
                            content: '❌ You need administrator permissions.', 
                            ephemeral: true 
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle('🎫 Romels Tickets')
                        .setDescription('**Open a ticket to purchase our stock.**\n\n✅ **Check our current stock before opening a ticket.**')
                        .setColor(0x3498db)
                        .setFooter({ text: 'Romel\'s Stock • Quality Service' })
                        .setTimestamp();

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('ticket_type')
                                .setPlaceholder('Choose a service...')
                                .addOptions([
                                    {
                                        label: 'Limiteds',
                                        description: 'Buy or sell Limited items',
                                        value: 'Buying/Selling Limiteds'
                                    },
                                    {
                                        label: 'Dahood Skins',
                                        description: 'Buy or sell Dahood skins',
                                        value: 'Buying/Selling Dahood Skins'
                                    },
                                    {
                                        label: 'Buying Services',
                                        description: 'Professional buying services',
                                        value: 'Buying Services'
                                    }
                                ])
                        );

                    await interaction.reply({ 
                        content: '✅ Ticket panel created!', 
                        ephemeral: true 
                    });
                    
                    await interaction.channel.send({ embeds: [embed], components: [row] });
                    break;

                case 'reset-tickets':
                    if (!interaction.member.roles.cache.has(config.adminRole)) {
                        return await interaction.reply({ 
                            content: '❌ You need the staff role.', 
                            ephemeral: true 
                        });
                    }

                    const data = db.read();
                    data.tickets = {};
                    db.write(data);

                    await interaction.reply({ 
                        content: '✅ All ticket data has been reset.', 
                        ephemeral: true 
                    });
                    break;

                case 'ping':
                    const latency = Date.now() - interaction.createdTimestamp;
                    await interaction.reply({ 
                        content: `🏓 Pong! Latency: ${latency}ms`,
                        ephemeral: true 
                    });
                    break;
            }
            return;
        }

        if (!interaction.isStringSelectMenu() && !interaction.isButton() && !interaction.isModalSubmit()) return;

        // Ticket type selection
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
            const result = await createTicket(interaction, interaction.values[0]);
            if (result) {
                // Store ticket data for later transcript
                await db.set(`tickets.${result.data.channelId}`, result.data);
            }
        }

        // Vouch rating selection
        if (interaction.isStringSelectMenu() && interaction.customId === 'vouch_rating') {
            const rating = parseInt(interaction.values[0].split('_')[1]);
            
            vouchSessions.set(interaction.user.id, { rating });

            const modal = new ModalBuilder()
                .setCustomId('vouch_comment_modal')
                .setTitle('Add Your Feedback (Optional)');

            const commentInput = new TextInputBuilder()
                .setCustomId('vouch_comment')
                .setLabel('Your comments (optional)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(500);

            modal.addComponents(new ActionRowBuilder().addComponents(commentInput));
            await interaction.showModal(modal);
        }

        // Vouch comment modal
        if (interaction.isModalSubmit() && interaction.customId === 'vouch_comment_modal') {
            const comment = interaction.fields.getTextInputValue('vouch_comment');
            const vouchData = vouchSessions.get(interaction.user.id);
            
            if (vouchData && vouchData.rating) {
                await sendVouchToChannel(interaction.user, vouchData.rating, 'Service', comment);
                vouchSessions.delete(interaction.user.id);

                await interaction.reply({ 
                    content: '✅ Thank you for your feedback!', 
                    ephemeral: true 
                });
            }
        }

        // Close ticket button
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            const closeEmbed = new EmbedBuilder()
                .setTitle('Close Ticket')
                .setDescription('Are you sure you want to close this ticket? A transcript will be saved.')
                .setColor(0xe74c3c)
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_close')
                        .setLabel('Confirm Close')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_close')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({ embeds: [closeEmbed], components: [row], ephemeral: true });
        }

        // Confirm close ticket
        if (interaction.isButton() && interaction.customId === 'confirm_close') {
            await interaction.deferUpdate();
            
            // Get ticket data
            const ticketData = await db.get(`tickets.${interaction.channel.id}`);
            
            // Send vouch request to ticket creator
            const members = await interaction.channel.members.fetch();
            const ticketCreator = members.find(member => !member.user.bot);
            
            if (ticketCreator) {
                await sendVouchRequest(ticketCreator.user, ticketData?.description || 'Service', interaction.user.tag);
            }

            // Collect and send transcript
            if (ticketData) {
                const transcriptMessages = await collectTranscript(interaction.channel);
                await sendTranscript(ticketData, transcriptMessages);
            }

            const closingEmbed = new EmbedBuilder()
                .setTitle('Ticket Closed')
                .setDescription(`Closed by ${interaction.user}\n\nTranscript has been saved.`)
                .setColor(0x95a5a6)
                .setTimestamp();

            await interaction.channel.send({ embeds: [closingEmbed] });
            
            // Clean up ticket data
            if (ticketData) {
                await db.set(`tickets.${interaction.channel.id}`, null);
            }
            
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                } catch (error) {
                    console.log('Error deleting channel:', error);
                }
            }, 3000);
        }

        // Cancel close ticket
        if (interaction.isButton() && interaction.customId === 'cancel_close') {
            await interaction.update({ 
                content: 'Ticket closure cancelled.', 
                components: [] 
            });
        }

    } catch (error) {
        console.error('Interaction error:', error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ 
                    content: 'An error occurred.', 
                    components: [] 
                });
            } else {
                await interaction.reply({ 
                    content: 'An error occurred.', 
                    ephemeral: true 
                });
            }
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    }
});

client.login(config.token);