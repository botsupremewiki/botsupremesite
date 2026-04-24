import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  type TextChannel,
} from "discord.js";

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_WELCOME_CHANNEL_ID;
const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const MESSAGE_ID = process.env.DISCORD_WELCOME_MESSAGE_ID;
const SHOULD_UPDATE = process.argv.includes("--update");

if (!TOKEN) throw new Error("DISCORD_BOT_TOKEN manquant dans bot/.env");
if (!CHANNEL_ID)
  throw new Error("DISCORD_WELCOME_CHANNEL_ID manquant dans bot/.env");

const embed = new EmbedBuilder()
  .setColor(0x6366f1)
  .setTitle("Site Ultime")
  .setDescription(
    [
      "**Univers 2D multijoueur — un seul monde, tous les jeux.**",
      "",
      "Entre dans la plaza, croise les autres joueurs et traverse un portail pour lancer une partie.",
    ].join("\n"),
  )
  .addFields(
    {
      name: "Casino",
      value: "Blackjack, roulette, poker, slots, mines, Hi-Lo.",
      inline: true,
    },
    {
      name: "RPG & TCG",
      value: "Aventure et duels de cartes Pokémon.",
      inline: true,
    },
    {
      name: "Gestion",
      value: "Royaume médiéval ou empire commercial.",
      inline: true,
    },
    {
      name: "Comment ça marche",
      value: [
        "1. Clique sur **Entrer dans le monde** ci-dessous",
        "2. Autorise l'app avec ton compte Discord (une seule fois)",
        "3. Ta progression (or, inventaire) est sauvegardée sur ton compte",
      ].join("\n"),
    },
  )
  .setFooter({
    text: "Tu joueras avec ton pseudo et avatar Discord.",
  });

const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder()
    .setLabel("Entrer dans le monde")
    .setStyle(ButtonStyle.Link)
    .setURL(`${SITE_URL}/join`),
  new ButtonBuilder()
    .setLabel("En savoir plus")
    .setStyle(ButtonStyle.Link)
    .setURL(SITE_URL),
);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

try {
  await client.login(TOKEN);

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    throw new Error(
      `Le salon ${CHANNEL_ID} est introuvable ou n'est pas un salon texte.`,
    );
  }

  const textChannel = channel as TextChannel;

  if (SHOULD_UPDATE && MESSAGE_ID) {
    const message = await textChannel.messages.fetch(MESSAGE_ID);
    await message.edit({ embeds: [embed], components: [row] });
    console.log(`Message mis à jour : ${message.url}`);
  } else {
    const message = await textChannel.send({
      embeds: [embed],
      components: [row],
    });
    console.log(`Message posté : ${message.url}`);
    console.log(
      `Ajoute DISCORD_WELCOME_MESSAGE_ID=${message.id} dans bot/.env pour pouvoir l'éditer via 'npm run bot:update'.`,
    );
  }
} finally {
  await client.destroy();
}
