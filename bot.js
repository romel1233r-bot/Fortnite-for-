const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
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
}

const db = new SimpleDB();

// Config
const config = {
    token: process.env.BOT_TOKEN,
    guildId: '1406416544451399832',
    adminRole: '1406420130044313772',
    ticketsChannel: '1406418069181436017',
    vouchChannel: '1429250208016896040'
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

// Custom emoji codes
const EMOJIS = {
    LIMITEDS: '<:lim:1429231822646018149>',
    DAHOOD: '<:dh:1429232221683712070>',
    SERVICES: '<:discord:1429232874338652260>',
    CHECKMARK: '<:checkmark:1406769918866620416>'
};

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

function startAntiScamMessages() {
    sendAntiScamMessage();
    setInterval(sendAntiScamMessage, 50 * 60 * 1000);
}

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} is online! Ready for Romel's Stock!`);
    
    client.user.setPresence({
        activities: [{ name: 'discord.gg/romel', type: 3 }],
        status: 'online'
    });

    await registerSlashCommands();
    startAntiScamMessages();
});

// Professional ticket creation
async function createTicket(interaction, type, description) {
    try {
        const guild = interaction.guild;
        const member = interaction.member;

        // Check for existing tickets
        const userTickets = await db.get(`tickets.${member.id}`) || [];
        const openTicket = userTickets.find(ticket => ticket.open);
        
        if (openTicket) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('🎫 Active Ticket Found')
                .setDescription(`You already have an open ticket!\n\nPlease close it before creating a new one.`)
                .setColor(0xe74c3c)
                .setFooter({ text: 'Romel\'s Stock • Ticket System' })
                .setTimestamp();

            return await interaction.reply({ 
                embeds: [errorEmbed], 
                ephemeral: true 
            });
        }

        const loadingEmbed = new EmbedBuilder()
            .setTitle('⚡ Creating Your Ticket...')
            .setDescription('Setting up your premium support channel')
            .setColor(0x3498db)
            .setTimestamp();

        await interaction.reply({ 
            embeds: [loadingEmbed], 
            ephemeral: true 
        });

        const ticketNumber = (await db.get('counter') || 0) + 1;
        const ticketChannel = await guild.channels.create({
            name: `ticket-${ticketNumber}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.id, deny: [BigInt(0x0000000000000400)] },
                { id: member.id, allow: [BigInt(0x0000000000000400), BigInt(0x0000000000000800)] },
                { id: config.adminRole, allow: [BigInt(0x0000000000000400), BigInt(0x0000000000000800)] }
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
            number: ticketNumber
        };
        
        const currentTickets = await db.get(`tickets.${member.id}`) || [];
        currentTickets.push(ticketData);
        await db.set(`tickets.${member.id}`, currentTickets);
        await db.set('counter', ticketNumber);

        const ticketEmbed = new EmbedBuilder()
            .setTitle(`🎫 Ticket #${ticketNumber}`)
            .setDescription(`Welcome to your dedicated support channel!\n\n**Service:** ${description}\n**Client:** ${member}\n**Created:** <t:${Math.floor(Date.now()/1000)}:R>`)
            .addFields(
                { 
                    name: '📋 Getting Started', 
                    value: 'Please provide details about what you need. Our team will assist you shortly.' 
                },
                { 
                    name: '🚨 Security Notice', 
                    value: 'Staff will **NEVER** DM you first. Only trust messages in this ticket channel.' 
                }
            )
            .setColor(0x3498db)
            .setThumbnail('https://media.discordapp.net/attachments/1429234159674593352/1429235801782489160/romels_stock_banner1.png')
            .setFooter({ text: 'Romel\'s Stock • Premium Support' })
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
            content: `${member} <@&${config.adminRole}> 🔔`, 
            embeds: [ticketEmbed], 
            components: [ticketButtons] 
        });

        const successEmbed = new EmbedBuilder()
            .setTitle(`${EMOJIS.CHECKMARK} Ticket Created Successfully!`)
            .setDescription(`**Channel:** ${ticketChannel}\n**Service:** ${description}\n\nOur staff team has been notified and will assist you shortly.`)
            .setColor(0x27ae60)
            .setTimestamp();

        await interaction.editReply({ 
            embeds: [successEmbed] 
        });

    } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.editReply({ 
            content: '❌ Failed to create ticket. Please try again.', 
            embeds: [] 
        });
    }
}

// Premium vouch system
async function sendVouchRequest(user, ticketDescription, staffMember) {
    try {
        const vouchEmbed = new EmbedBuilder()
            .setTitle('🌟 Rate Your Experience')
            .setDescription(`Thank you for choosing **Romel's Stock** for **${ticketDescription}**.\n\nYour feedback helps us maintain our quality service.`)
            .addFields(
                { 
                    name: '📊 Service Summary', 
                    value: `**Service:** ${ticketDescription}\n**Handled By:** ${staffMember || 'Support Team'}\n**Completed:** <t:${Math.floor(Date.now()/1000)}:R>` 
                },
                { 
                    name: '⭐ Your Rating', 
                    value: 'Select your rating below, then add a comment if you wish.' 
                }
            )
            .setColor(0x9B59B6)
            .setThumbnail('https://media.discordapp.net/attachments/1429234159674593352/1429235801782489160/romels_stock_banner1.png')
            .setFooter({ text: 'Romel\'s Stock • Customer Feedback' })
            .setTimestamp();

        const vouchDropdown = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('vouch_rating')
                    .setPlaceholder('🎯 Select your rating...')
                    .addOptions([
                        {
                            label: '5 Stars - Outstanding!',
                            description: 'Perfect experience, highly recommended!',
                            value: 'vouch_5',
                            emoji: '⭐'
                        },
                        {
                            label: '4 Stars - Great Service',
                            description: 'Very good, minor improvements needed',
                            value: 'vouch_4',
                            emoji: '⭐'
                        },
                        {
                            label: '3 Stars - Good Service',
                            description: 'Satisfactory with room for improvement',
                            value: 'vouch_3',
                            emoji: '⭐'
                        },
                        {
                            label: '2 Stars - Fair Experience',
                            description: 'Could be better, needs improvements',
                            value: 'vouch_2',
                            emoji: '⭐'
                        },
                        {
                            label: '1 Star - Poor Experience',
                            description: 'Needs significant improvements',
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
            .setTitle('📝 Customer Review')
            .setDescription(`**Rating:** ${rating}/5 ${stars}\n**Service:** ${ticketDescription}`)
            .addFields(
                { name: '👤 Reviewed By', value: `${user.tag}`, inline: true },
                { name: '🆔 User ID', value: `\`${user.id}\``, inline: true },
                { name: '🕒 Review Time', value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true }
            )
            .setColor(ratingColor)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: 'Romel\'s Stock • Customer Feedback System' })
            .setTimestamp();

        if (comment && comment.trim() !== '') {
            vouchEmbed.addFields({
                name: '💬 Customer Feedback',
                value: `"${comment}"`
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
                            content: '❌ You need administrator permissions to use this command.', 
                            ephemeral: true 
                        });
                    }

                    const embed = new EmbedBuilder()
                        .setTitle(`${EMOJIS.LIMITEDS} Romels Tickets`)
                        .setDescription(`**Open a ticket to purchase our stock.**\n\n${EMOJIS.CHECKMARK} **Check our current stock before opening a ticket.**`)
                        .setColor(0x3498db)
                        .setThumbnail('https://media.discordapp.net/attachments/1429234159674593352/1429235801782489160/romels_stock_banner1.png')
                        .setFooter({ text: 'Romel\'s Stock • Quality Service', iconURL: client.user.displayAvatarURL() })
                        .setTimestamp();

                    const row = new ActionRowBuilder()
                        .addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('ticket_type')
                                .setPlaceholder('🎫 Choose a service...')
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

                    await interaction.reply({ 
                        content: '✅ Ticket panel created successfully!', 
                        ephemeral: true 
                    });
                    
                    await interaction.channel.send({ embeds: [embed], components: [row] });
                    break;

                case 'reset-tickets':
                    if (!interaction.member.roles.cache.has(config.adminRole)) {
                        return await interaction.reply({ 
                            content: '❌ You need the staff role to use this command.', 
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
                        content: `🏓 Pong! Latency: ${latency}ms | API: ${Math.round(client.ws.ping)}ms`,
                        ephemeral: true 
                    });
                    break;
            }
            return;
        }

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
                            .setPlaceholder('💫 Select transaction type...')
                            .addOptions([
                                {
                                    label: `Buy ${serviceName}`,
                                    description: `Purchase ${serviceName.toLowerCase()}`,
                                    value: `buy_${selected}`,
                                    emoji: selected === 'limiteds' ? EMOJIS.LIMITEDS.replace(/[<>]/g, '').split(':')[2] : EMOJIS.DAHOOD.replace(/[<>]/g, '').split(':')[2]
                                },
                                {
                                    label: `Sell ${serviceName}`,
                                    description: `Sell your ${serviceName.toLowerCase()}`,
                                    value: `sell_${selected}`,
                                    emoji: selected === 'limiteds' ? EMOJIS.LIMITEDS.replace(/[<>]/g, '').split(':')[2] : EMOJIS.DAHOOD.replace(/[<>]/g, '').split(':')[2]
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
            const ticketType = `${action}-${type}`;
            const serviceName = type === 'limiteds' ? 'Limiteds' : 'Dahood Skins';
            const description = `${action === 'buy' ? 'Buying' : 'Selling'} ${serviceName}`;
            
            await createTicket(interaction, ticketType, description);
        }

        // Vouch rating selection
        if (interaction.isStringSelectMenu() && interaction.customId === 'vouch_rating') {
            const rating = parseInt(interaction.values[0].split('_')[1]);
            
            vouchSessions.set(interaction.user.id, { rating });

            const modal = new ModalBuilder()
                .setCustomId('vouch_comment_modal')
                .setTitle('💬 Add Your Feedback (Optional)');

            const commentInput = new TextInputBuilder()
                .setCustomId('vouch_comment')
                .setLabel('Share your experience or suggestions...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(1000)
                .setPlaceholder('What did you like? How can we improve? (Optional)');

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

                const thankYouEmbed = new EmbedBuilder()
                    .setTitle('🎉 Thank You for Your Feedback!')
                    .setDescription('Your review has been recorded and helps us improve our service quality.')
                    .setColor(0x27ae60)
                    .setFooter({ text: 'Romel\'s Stock • We Value Your Input' })
                    .setTimestamp();

                await interaction.reply({ embeds: [thankYouEmbed], ephemeral: true });
            }
        }

        // Close ticket button
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            const closeEmbed = new EmbedBuilder()
                .setTitle('🔒 Close Ticket')
                .setDescription('Are you sure you want to close this ticket? A feedback request will be sent to the user.')
                .setColor(0xe74c3c)
                .setFooter({ text: 'Romel\'s Stock • Ticket Management' })
                .setTimestamp();

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_close')
                        .setLabel('✅ Confirm Close')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_close')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({ embeds: [closeEmbed], components: [row], ephemeral: true });
        }

        // Confirm close ticket
        if (interaction.isButton() && interaction.customId === 'confirm_close') {
            await interaction.deferUpdate();
            
            // Find ticket creator
            const members = await interaction.channel.members.fetch();
            const ticketCreator = members.find(member => !member.user.bot);
            
            if (ticketCreator) {
                await sendVouchRequest(ticketCreator.user, 'Service', interaction.user.tag);
            }

            const closingEmbed = new EmbedBuilder()
                .setTitle('🎉 Ticket Closed')
                .setDescription(`**Closed by:** ${interaction.user}\n\nFeedback request sent to user.`)
                .setColor(0x95a5a6)
                .setTimestamp();

            await interaction.channel.send({ embeds: [closingEmbed] });
            
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
                content: '✅ Ticket closure cancelled.', 
                components: [] 
            });
        }

    } catch (error) {
        console.error('Interaction error:', error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ 
                    content: '❌ An error occurred. Please try again.', 
                    components: [] 
                });
            } else {
                await interaction.reply({ 
                    content: '❌ An error occurred. Please try again.', 
                    ephemeral: true 
                });
            }
        } catch (e) {
            console.error('Failed to send error message:', e);
        }
    }
});

client.login(config.token);