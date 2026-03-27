#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const arenaUrl = process.env.CLAW_ARENA_URL || 'https://arena.clawai.cn';
const arenaKey = process.env.CLAW_ARENA_API_KEY || '';
const tensorslabKey = process.env.TENSORSLAB_API_KEY || '';

function usage() {
  console.log('Usage: node auto_join_battle.js <battle-url> --agent-id <id> --agent-key <key> [--model seedreamv4]');
  process.exit(1);
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : '';
}

function extractCompetitionId(battleUrl) {
  const match = battleUrl.match(/\/game\/([^/?#]+)/i) || battleUrl.match(/\/competitions\/([^/?#]+)/i);
  if (!match) throw new Error('Invalid battle URL');
  return match[1];
}

function buildPrompt(competition) {
  const rules = competition.rules || '';
  const title = competition.title || 'Claw Arena battle';
  const theme = `${title}. ${rules}`.trim();
  return `Create a high-impact competition image for: ${theme}\n\nStyle: cinematic, vivid, competitive, game arena, neon highlights, detailed composition, social media ready`;
}

async function pollTask(taskId, model) {
  for (let i = 0; i < 90; i++) {
    const res = await axios.get(`https://api.tensorslab.com/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${tensorslabKey}` },
    });
    const data = res.data || {};
    if (data.status === 3 || data.status === 'completed' || data.state === 'completed') return data;
    if (data.images?.length || data.result?.images?.length || data.output?.images?.length) return data;
    await new Promise(r => setTimeout(r, 4000));
  }
  throw new Error(`Timed out waiting for ${model} generation`);
}

async function generateImage(prompt, model) {
  const res = await axios.post(
    `https://api.tensorslab.com/v1/images/${model}`,
    { prompt, num_images: 1 },
    { headers: { Authorization: `Bearer ${tensorslabKey}`, 'Content-Type': 'application/json' } }
  );

  const data = res.data || {};
  if (data.images?.length) return data.images[0].url || data.images[0].image_url || data.images[0];
  if (data.result?.images?.length) return data.result.images[0].url || data.result.images[0].image_url || data.result.images[0];
  if (data.output?.images?.length) return data.output.images[0].url || data.output.images[0].image_url || data.output.images[0];
  if (data.task_id || data.id) {
    const task = await pollTask(data.task_id || data.id, model);
    const image = task.images?.[0] || task.result?.images?.[0] || task.output?.images?.[0];
    if (typeof image === 'string') return image;
    if (image?.url) return image.url;
    if (image?.image_url) return image.image_url;
  }
  throw new Error('No image URL returned from TensorsLab');
}

async function joinCompetition(competitionId, agentId, agentKey) {
  await axios.post(
    `${arenaUrl}/api/v1/competitions/${competitionId}/join`,
    { agentId },
    { headers: { Authorization: `Bearer ${agentKey}`, 'Content-Type': 'application/json' } }
  );
}

async function submitEntry(competitionId, agentId, agentKey, prompt, mediaUrl) {
  const res = await axios.post(
    `${arenaUrl}/api/v1/competitions/${competitionId}/submit`,
    { agentId, prompt, mediaUrl, mediaType: 'image' },
    { headers: { Authorization: `Bearer ${agentKey}`, 'Content-Type': 'application/json' } }
  );
  return res.data;
}

async function main() {
  const battleUrl = process.argv[2];
  const agentId = argValue('--agent-id');
  const agentKey = argValue('--agent-key') || arenaKey;
  const model = argValue('--model') || 'seedreamv4';

  if (!battleUrl || !agentId || !agentKey || !tensorslabKey) usage();

  const competitionId = extractCompetitionId(battleUrl);
  const competition = (await axios.get(`${arenaUrl}/api/v1/competitions/${competitionId}`)).data;
  const prompt = buildPrompt(competition);
  const imageUrl = await generateImage(prompt, model);

  try {
    await joinCompetition(competitionId, agentId, agentKey);
  } catch (error) {
    if (!(error.response && error.response.status === 409)) throw error;
  }

  const result = await submitEntry(competitionId, agentId, agentKey, prompt, imageUrl);
  console.log(JSON.stringify({ competitionId, imageUrl, result }, null, 2));
}

main().catch(err => {
  console.error(err.response?.data || err.message || err);
  process.exit(1);
});
