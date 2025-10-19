const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Simple JSON database
class SimpleDB {
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

    async resetUserTickets(userId) {
        const data = this.read();
        if (data.tickets && data.tickets[userId]) {
            delete data.tickets[userId];
            this.write(data);
        }
    }
}

const db = new SimpleDB();

// Config with all your channels
const config = {
    token: process.env.DISCORD_TOKEN || process.env.BOT_TOKEN,
    guildId: '1406416544451399832',
    adminRole: '1406420130044313772',
    ticketCategory: '1406418069181436017',
    transcriptChannel: '1406761652510134294',
    vouchChannel: '1429250208016896040'
};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions
    ]
});

// All your emoji codes kept intact
const EMOJIS = {
    LIMITEDS: '<:lim:1429231822646018149>',
    DAHOOD: '<:dh:1429232221683712070>',
    SERVICES: '<:discord:1429232874338652260>',
    CHECKMARK: '<:checkmark:1406769918866620416>'
};

// Store for vouch data
const vouchSessions = new Map();
const securityMessages = new Map();

// Security warning system
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

        const securityEmbed = new EmbedBuilder()
            .setTitle('🛡️ **SECURITY NOTICE**')
            .setDescription('**Staff will __NEVER__ message you first. Beware of scammers in DMs!**')
            .setColor(0xf39c12)
            .setTimestamp();

        const msg = await channel.send({ embeds: [securityEmbed] });
        securityMessages.set(channel.id, msg.id);
    } catch (error) {
        console.log('Security warning error:', error);
    }
}

// Professional ticket creation
async function createTicket(interaction, type, description) {
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
                        .setTitle('❌ Already Have Open Ticket')
                        .setDescription(`You already have an active ticket: ${channel}\n\nPlease close it before creating a new one.`)
                        .setColor(0xe74c3c)
                        .setTimestamp();

                    return await interaction.reply({ 
                        embeds: [errorEmbed], 
                        ephemeral: true 
                    });
                }
            } catch (error) {
                await db.resetUserTickets(member.id);
            }
        }

        // Create loading message
        const loadingEmbed = new EmbedBuilder()
            .setTitle('🔄 Creating your ticket...')
            .setDescription('Setting up your support channel')
            .setColor(0x3498db)
            .setTimestamp();

        await interaction.reply({ 
            embeds: [loadingEmbed], 
            ephemeral: true 
        });

        // Create ticket channel in category
        const ticketNumber = (await db.get('counter') || 0) + 1;
        const ticketChannel = await guild.channels.create({
            name: `ticket-${ticketNumber}`,
            type: ChannelType.GuildText,
            parent: config.ticketCategory,
            permissionOverwrites: [
                { id: guild.id, deny: [1024n] },
                { id: member.id, allow: [1024n, 2048n] },
                { id: config.adminRole, allow: [1024n, 2048n, 65536n] }
            ]
        });

        // Save ticket data
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

        // Create ticket embed
        const ticketEmbed = new EmbedBuilder()
            .setTitle(`🎫 Ticket #${ticketNumber}`)
            .setDescription(`**Service:** ${description}\n**Client:** ${member}\n**Created:** <t:${Math.floor(Date.now()/1000)}:R>`)
            .addFields(
                { 
                    name: '📝 Getting Started', 
                    value: 'Please provide details about what you need. Our team will assist you shortly.' 
                },
                {
                    name: '🛡️ Security Notice',
                    value: 'Staff will **NEVER** message you first. Beware of scammers in DMs!'
                }
            )
            .setColor(0x3498db)
            .setFooter({ text: 'Romel\'s Stock • Quality Service' })
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

        // Success message
        const successEmbed = new EmbedBuilder()
            .setTitle('✅ Ticket Created')
            .setDescription(`**Channel:** ${ticketChannel}\n**Service:** ${description}\n\nStaff will assist you shortly.`)
            .setColor(0x27ae60)
            .setTimestamp();

        await interaction.editReply({ 
            embeds: [successEmbed] 
        });

        return ticketChannel;
    } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.editReply({ 
            content: '❌ Failed to create ticket. Please try again.', 
            embeds: [] 
        });
    }
}

// Transcript system
async function createTranscript(ticketData, messages) {
    try {
        const transcriptChannel = await client.channels.fetch(config.transcriptChannel);
        if (!transcriptChannel) return false;

        const transcriptEmbed = new EmbedBuilder()
            .setTitle(`📄 Ticket Transcript #${ticketData.number}`)
            .setDescription(`**Service:** ${ticketData.description}`)
            .addFields(
                { name: '👤 Client', value: ticketData.userTag, inline: true },
                { name: '🕒 Duration', value: `${Math.round((new Date(ticketData.closedAt) - new Date(ticketData.createdAt)) / 60000)}m`, inline: true },
                { name: '🔧 Closed By', value: ticketData.closedBy, inline: true }
            )
            .setColor(0x3498db)
            .setTimestamp();

        let transcriptText = `Romel's Stock - Ticket #${ticketData.number}\n`;
        transcriptText += `Service: ${ticketData.description}\n`;
        transcriptText += `Client: ${ticketData.userTag} (${ticketData.userId})\n`;
        transcriptText += `Closed By: ${ticketData.closedBy}\n\n`;
        transcriptText += `Messages:\n`;

        Array.from(messages.values()).reverse().forEach(msg => {
            const time = new Date(msg.createdTimestamp).toLocaleTimeString();
            transcriptText += `[${time}] ${msg.author.tag}: ${msg.content}\n`;
        });

        await transcriptChannel.send({
            embeds: [transcriptEmbed],
            files: [{
                attachment: Buffer.from(transcriptText, 'utf8'),
                name: `transcript-${ticketData.number}.txt`
            }]
        });

        return true;
    } catch (error) {
        console.log('Transcript error:', error);
        return false;
    }
}

// Professional vouch system
async function sendVouchRequest(user, ticketDescription, staffMember) {
    try {
        const vouchEmbed = new EmbedBuilder()
            .setTitle('⭐ How was your experience?')
            .setDescription(`Thank you for using Romel's Stock for **${ticketDescription}**.\n\nYour feedback helps us improve our service.`)
            .addFields(
                { 
                    name: '📋 Service Details', 
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
                        { label: '5 Stars - Excellent', value: 'vouch_5', emoji: '⭐' },
                        { label: '4 Stars - Great', value: 'vouch_4', emoji: '⭐' },
                        { label: '3 Stars - Good', value: 'vouch_3', emoji: '⭐' },
                        { label: '2 Stars - Fair', value: 'vouch_2', emoji: '⭐' },
                        { label: '1 Star - Poor', value: 'vouch_1', emoji: '⭐' }
                    ])
            );

        const dm = await user.send({ 
            embeds: [vouchEmbed], 
            components: [vouchDropdown] 
        });
        
        vouchSessions.set(user.id, { ticketDescription, staffMember, messageId: dm.id });
        return true;
    } catch (error) {
        console.log('Could not send vouch request:', error);
        return false;
    }
}

// Send professional vouch to channel
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
            .setTitle('📊 Customer Review')
            .setDescription(`**Rating:** ${rating}/5 ${stars}\n**Service:** ${ticketDescription}`)
            .addFields(
                { name: '👤 Reviewed By', value: `${user.tag}`, inline: true },
                { name: '🆔 User ID', value: `\`${user.id}\``, inline: true },
                { name: '🕒 Time', value: `<t:${Math.floor(Date.now()/1000)}:R>`, inline: true }
            )
            .setColor(ratingColor)
            .setFooter({ text: 'Romel\'s Stock • Customer Feedback' })
            .setTimestamp();

        if (comment && comment.trim() !== '') {
            vouchEmbed.addFields({ name: '💬 Comment', value: comment });
        }

        await vouchChannel.send({ embeds: [vouchEmbed] });
        return true;
    } catch (error) {
        console.log('Could not send vouch to channel:', error);
        return false;
    }
}

client.once('ready', () => {
    console.log(`✅ ${client.user.tag} is online! Ready for Romel's Stock!`);
    client.user.setPresence({
        activities: [{ name: 'discord.gg/romel', type: 3 }],
        status: 'online'
    });

    // Start security system
    sendSecurityWarning();
    setInterval(sendSecurityWarning, 50 * 60 * 1000);
});

// Main interaction handler
client.on('interactionCreate', async (interaction) => {
    try {
        if (!interaction.isStringSelectMenu() && !interaction.isButton() && !interaction.isModalSubmit()) return;

        // Ticket type selection
        if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
            const selected = interaction.values[0];
            
            if (selected === 'limiteds' || selected === 'dahood') {
                const serviceName = selected === 'limiteds' ? 'Limiteds' : 'Dahood Skins';
                const serviceEmoji = selected === 'limiteds' ? EMOJIS.LIMITEDS : EMOJIS.DAHOOD;
                
                const buySellEmbed = new EmbedBuilder()
                    .setTitle(`${serviceEmoji} ${serviceName}`)
                    .setDescription(`Choose your transaction type:`)
                    .setColor(0x3498db)
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId(`buy_sell_${selected}`)
                            .setPlaceholder('Select buy or sell...')
                            .addOptions([
                                {
                                    label: `Buy ${serviceName}`,
                                    description: `Purchase ${serviceName.toLowerCase()}`,
                                    value: `buy_${selected}`,
                                    emoji: '💰'
                                },
                                {
                                    label: `Sell ${serviceName}`,
                                    description: `Sell your ${serviceName.toLowerCase()}`,
                                    value: `sell_${selected}`,
                                    emoji: '💎'
                                }
                            ])
                    );

                await interaction.reply({ embeds: [buySellEmbed], components: [row], ephemeral: true });
            } else if (selected === 'services') {
                await createTicket(interaction, 'services', `${EMOJIS.SERVICES} Buying Services`);
            }
        }

        // Buy/Sell selection
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('buy_sell_')) {
            const [action, type] = interaction.values[0].split('_');
            const serviceName = type === 'limiteds' ? 'Limiteds' : 'Dahood Skins';
            const description = `${action === 'buy' ? 'Buying' : 'Selling'} ${serviceName}`;
            
            await createTicket(interaction, `${action}-${type}`, description);
        }

        // Vouch rating selection
        if (interaction.isStringSelectMenu() && interaction.customId === 'vouch_rating') {
            const rating = parseInt(interaction.values[0].split('_')[1]);
            
            vouchSessions.set(interaction.user.id, {
                ...vouchSessions.get(interaction.user.id),
                rating: rating
            });

            const modal = new ModalBuilder()
                .setCustomId('vouch_comment_modal')
                .setTitle('Add Feedback (Optional)');

            const commentInput = new TextInputBuilder()
                .setCustomId('vouch_comment')
                .setLabel('Your comments (optional)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(500)
                .setPlaceholder('Share your experience...');

            modal.addComponents(new ActionRowBuilder().addComponents(commentInput));
            await interaction.showModal(modal);
        }

        // Vouch comment modal
        if (interaction.isModalSubmit() && interaction.customId === 'vouch_comment_modal') {
            const comment = interaction.fields.getTextInputValue('vouch_comment');
            const vouchData = vouchSessions.get(interaction.user.id);
            
            if (vouchData && vouchData.rating) {
                await sendVouchToChannel(interaction.user, vouchData.rating, vouchData.ticketDescription, comment);
                vouchSessions.delete(interaction.user.id);

                const thankYouEmbed = new EmbedBuilder()
                    .setTitle('✅ Thank you for your feedback!')
                    .setDescription('Your review has been recorded.')
                    .setColor(0x27ae60)
                    .setTimestamp();

                await interaction.reply({ embeds: [thankYouEmbed], ephemeral: true });
            }
        }

        // Close ticket button
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            const closeEmbed = new EmbedBuilder()
                .setTitle('🔒 Close Ticket')
                .setDescription('Are you sure? Feedback request will be sent to user.')
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
            
            const data = db.read();
            let currentTicket = null;
            let userId = null;

            for (const uid in data.tickets) {
                const userTickets = data.tickets[uid];
                const ticket = userTickets.find(t => t.channelId === interaction.channel.id && t.open);
                if (ticket) {
                    currentTicket = ticket;
                    userId = uid;
                    break;
                }
            }
            
            if (currentTicket && userId) {
                // Create transcript
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                await createTranscript(currentTicket, Array.from(messages.values()));
                
                // Send vouch request
                const user = await client.users.fetch(userId);
                await sendVouchRequest(user, currentTicket.description, interaction.user.tag);

                // Update ticket status
                currentTicket.open = false;
                currentTicket.closedAt = new Date().toISOString();
                currentTicket.closedBy = interaction.user.tag;
                await db.set(`tickets.${userId}`, data.tickets[userId]);

                const closingEmbed = new EmbedBuilder()
                    .setTitle('🔒 Ticket Closed')
                    .setDescription(`Closed by ${interaction.user}\n\n• Transcript saved\n• Feedback sent\n• Channel deleting...`)
                    .setColor(0x95a5a6)
                    .setTimestamp();

                await interaction.channel.send({ embeds: [closingEmbed] });
                
                setTimeout(async () => {
                    try {
                        await interaction.channel.delete();
                    } catch (error) {
                        console.log('Error deleting channel:', error);
                    }
                }, 5000);
            }
        }

        if (interaction.isButton() && interaction.customId === 'cancel_close') {
            await interaction.update({ 
                content: '❌ Ticket closure cancelled.', 
                components: [] 
            });
        }

    } catch (error) {
        console.error('Interaction error:', error);
        try {
            await interaction.reply({ 
                content: '❌ An error occurred. Please try again.', 
                ephemeral: true 
            });
        } catch (e) {}
    }
});

// Command handling
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    try {
        // Professional ticket panel
        if (message.content === '!setup-tickets' && message.member.permissions.has('Administrator')) {
            const embed = new EmbedBuilder()
                .setTitle('🎫 Romels Tickets')
                .setDescription(`**Open a ticket to purchase our stock.**\n\n${EMOJIS.CHECKMARK} **Check our current stock before opening a ticket.**`)
                .setColor(0x3498db)
                .setThumbnail('https://media.discordapp.net/attachments/1429234159674593352/1429235801782489160/romels_stock_banner1.png')
                .setFooter({ text: 'Romel\'s Stock • Quality Service', iconURL: client.user.displayAvatarURL() })
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
                                value: 'limiteds',
                                emoji: EMOJIS.LIMITEDS.replace(/[<>]/g, '').split(':')[2]
                            },
                            {
                                label: 'Dahood Skins',
                                description: 'Buy or sell Dahood skins',
                                value: 'dahood',
                                emoji: EMOJIS.DAHOOD.replace(/[<>]/g, '').split(':')[2]
                            },
                            {
                                label: 'Buying Services',
                                description: 'Professional buying services',
                                value: 'services',
                                emoji: EMOJIS.SERVICES.replace(/[<>]/g, '').split(':')[2]
                            }
                        ])
                );

            await message.channel.send({ embeds: [embed], components: [row] });
            await message.delete();
        }

        // Reset tickets command
        if (message.content === '!reset-tickets' && message.member.roles.cache.has(config.adminRole)) {
            const data = db.read();
            data.tickets = {};
            db.write(data);

            await message.reply({ 
                content: '✅ All ticket data has been reset.', 
                ephemeral: true 
            });
        }
    } catch (error) {
        console.error('Message command error:', error);
    }
});

client.login(config.token);