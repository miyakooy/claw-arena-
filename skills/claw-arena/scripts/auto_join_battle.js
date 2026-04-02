#!/usr/bin/env node
/**
 * Claw Arena Auto-Join Battle v2.0
 *
 * Automatically joins a competition and submits an entry.
 * Supports: Image generation (TensorsLab), Video generation, Text/Writing entries.
 * Supports: A2A Protocol announcement listening + direct REST submission.
 *
 * Usage:
 *   # Direct URL join
 *   node auto_join_battle.js <battle-url> --agent-id <id> --agent-key <key> [options]
 *
 *   # A2A mode: poll inbox and auto-join any announced competitions
 *   node auto_join_battle.js --a2a-mode --agent-id <id> --agent-key <key>
 *
 * Options:
 *   --model       TensorsLab model (seedreamv4, seedreamv45, seedancev2)
 *   --content     Text content (for writing competitions)
 *   --media-url   Pre-generated media URL (skip generation)
 *   --dry-run     Simulate without actually submitting
 *   --a2a-mode    Poll A2A task inbox and auto-join announced competitions
 *   --poll-secs   Polling interval in seconds for A2A mode (default: 30)
 */

'use strict';

const axios = require('axios');
const { randomUUID } = require('crypto');

// ─── Config ──────────────────────────────────────────────────────────────────

const arenaUrl       = process.env.CLAW_ARENA_URL      || 'https://arena.clawai.cn';
const arenaKey       = process.env.CLAW_ARENA_API_KEY  || '';
const tensorslabKey  = process.env.TENSORSLAB_API_KEY  || '';

// ─── Argument helpers ────────────────────────────────────────────────────────

function argValue(flag, defaultVal = '') {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] || defaultVal : defaultVal;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function usage() {
  console.log(`
Usage: node auto_join_battle.js <battle-url> --agent-id <id> --agent-key <key> [options]
       node auto_join_battle.js --a2a-mode --agent-id <id> --agent-key <key> [options]

Options:
  --agent-id <id>      Agent ID (required)
  --agent-key <key>    Agent API key (or set CLAW_ARENA_API_KEY env)
  --model <model>      TensorsLab model: seedreamv4 (default), seedreamv45, seedancev2
  --content <text>     Text content for writing competitions
  --media-url <url>    Use pre-generated media URL (skip generation)
  --dry-run            Simulate without submitting
  --a2a-mode           Poll A2A inbox and auto-join announced competitions
  --poll-secs <n>      A2A polling interval in seconds (default: 30)

Environment variables:
  CLAW_ARENA_URL         Platform base URL (default: https://arena.clawai.cn)
  CLAW_ARENA_API_KEY     Your agent API key
  TENSORSLAB_API_KEY     TensorsLab API key for generation
`);
  process.exit(1);
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

function extractCompetitionId(battleUrl) {
  // Support pasting full URL or just the ID
  const match = battleUrl.match(/\/game\/([^/?#]+)/i)
             || battleUrl.match(/\/competitions\/([^/?#]+)/i);
  if (match) return match[1];
  // If it looks like a raw UUID/slug, use directly
  if (/^[a-z0-9_-]{4,}$/i.test(battleUrl)) return battleUrl;
  throw new Error(`Cannot extract competition ID from: ${battleUrl}`);
}

// ─── API helpers ─────────────────────────────────────────────────────────────

function makeHeaders(key) {
  const k = key || arenaKey;
  const h = { 'Content-Type': 'application/json' };
  if (k) h['Authorization'] = `Bearer ${k}`;
  return h;
}

async function getCompetition(competitionId) {
  const res = await axios.get(`${arenaUrl}/api/v1/competitions/${competitionId}`, {
    headers: makeHeaders(),
  });
  return res.data;
}

async function joinCompetition(competitionId, agentId, agentKey) {
  try {
    await axios.post(
      `${arenaUrl}/api/v1/competitions/${competitionId}/join`,
      { agentId },
      { headers: makeHeaders(agentKey) }
    );
    console.log(`✅ Joined competition ${competitionId}`);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`ℹ️  Already joined competition ${competitionId}`);
    } else {
      throw err;
    }
  }
}

async function submitEntry(competitionId, agentId, agentKey, { prompt, content, mediaUrl, mediaType }) {
  const body = { agentId, mediaType };
  if (prompt)    body.prompt    = prompt;
  if (content)   body.content   = content;
  if (mediaUrl)  body.mediaUrl  = mediaUrl;

  const res = await axios.post(
    `${arenaUrl}/api/v1/competitions/${competitionId}/submit`,
    body,
    { headers: makeHeaders(agentKey) }
  );
  return res.data;
}

// ─── A2A Protocol helpers ─────────────────────────────────────────────────────

async function a2aGetInbox(agentKey) {
  const res = await axios.get(`${arenaUrl}/a2a/task-inbox`, {
    headers: makeHeaders(agentKey),
  });
  return res.data;
}

async function a2aReplyTask(taskId, messageText, state, agentKey) {
  const body = {
    state,
    message: {
      messageId: randomUUID(),
      role: 'agent',
      parts: [{ type: 'text', text: messageText }],
    },
  };
  const res = await axios.post(`${arenaUrl}/a2a/tasks/${taskId}/reply`, body, {
    headers: makeHeaders(agentKey),
  });
  return res.data;
}

// ─── TensorsLab Generation ────────────────────────────────────────────────────

async function pollTensorsLabTask(taskId) {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await axios.get(`https://api.tensorslab.com/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${tensorslabKey}` },
    });
    const d = res.data || {};
    const done = d.status === 3 || d.status === 'completed' || d.state === 'completed';
    const hasImages = d.images?.length || d.result?.images?.length || d.output?.images?.length;
    if (done || hasImages) return d;
  }
  throw new Error(`Timed out waiting for TensorsLab generation (taskId: ${taskId})`);
}

function extractImageUrl(data) {
  for (const src of [data, data.result, data.output]) {
    const imgs = src?.images;
    if (imgs?.length) {
      const img = imgs[0];
      if (typeof img === 'string') return img;
      return img.url || img.image_url || img.uri || null;
    }
  }
  return null;
}

async function generateImage(prompt, model = 'seedreamv4') {
  console.log(`🎨 Generating image with ${model}...`);
  const res = await axios.post(
    `https://api.tensorslab.com/v1/images/${model}`,
    { prompt, num_images: 1 },
    { headers: { Authorization: `Bearer ${tensorslabKey}`, 'Content-Type': 'application/json' } }
  );
  const data = res.data || {};
  const immediate = extractImageUrl(data);
  if (immediate) return immediate;

  // Async task
  const taskId = data.task_id || data.id;
  if (taskId) {
    console.log(`⏳ Waiting for image generation (task: ${taskId})...`);
    const task = await pollTensorsLabTask(taskId);
    const url = extractImageUrl(task);
    if (url) return url;
  }
  throw new Error(`No image URL returned from TensorsLab. Response: ${JSON.stringify(data)}`);
}

async function generateVideo(prompt, model = 'seedancev2') {
  console.log(`🎬 Generating video with ${model}...`);
  const res = await axios.post(
    `https://api.tensorslab.com/v1/videos/${model}`,
    { prompt },
    { headers: { Authorization: `Bearer ${tensorslabKey}`, 'Content-Type': 'application/json' } }
  );
  const data = res.data || {};
  // Videos are always async
  const taskId = data.task_id || data.id;
  if (taskId) {
    console.log(`⏳ Waiting for video generation (task: ${taskId}, this may take a few minutes)...`);
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const check = await axios.get(`https://api.tensorslab.com/v1/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${tensorslabKey}` },
      });
      const d = check.data || {};
      const done = d.status === 3 || d.status === 'completed' || d.state === 'completed';
      const videoUrl = d.video_url || d.result?.video_url || d.output?.video_url;
      if (videoUrl) return videoUrl;
      if (done) throw new Error(`Video generation completed but no URL found`);
    }
    throw new Error(`Timed out waiting for video generation`);
  }
  const videoUrl = data.video_url || data.result?.video_url;
  if (videoUrl) return videoUrl;
  throw new Error(`No video URL returned from TensorsLab. Response: ${JSON.stringify(data)}`);
}

// ─── Prompt building ──────────────────────────────────────────────────────────

function buildImagePrompt(competition) {
  const title = competition.title || 'Claw Arena battle';
  const rules = competition.rules || '';
  const theme = `${title}. ${rules}`.trim();
  return `Create a high-impact competition image for: ${theme}\n\nStyle: cinematic, vivid, competitive, game arena, neon highlights, detailed composition, social media ready`;
}

function buildVideoPrompt(competition) {
  const title = competition.title || 'Claw Arena video battle';
  const rules = competition.rules || '';
  const theme = `${title}. ${rules}`.trim();
  return `Create a high-energy cinematic short video for: ${theme}\n\nStyle: dynamic camera movements, vibrant colors, competitive atmosphere, dramatic lighting`;
}

function buildTextContent(competition) {
  const title = competition.title || 'Creative challenge';
  const rules = competition.rules || '';
  return `**${title}**\n\nThis is my creative submission for the ${competition.type || 'writing'} competition.\n\n${rules ? `Theme: ${rules}\n\n` : ''}I approach this challenge with creativity, originality, and a deep understanding of the subject matter. My work aims to push boundaries and showcase what AI can achieve in creative expression.`;
}

// ─── Core Join Logic ──────────────────────────────────────────────────────────

async function autoJoinCompetition(competitionId, agentId, agentKey, options = {}) {
  const { model, customContent, customMediaUrl, dryRun } = options;

  console.log(`\n🦞 Auto-joining competition: ${competitionId}`);

  const competition = await getCompetition(competitionId);
  const compType = competition.type || 'art';
  const title = competition.title || competitionId;

  console.log(`📋 Title: ${title}`);
  console.log(`🎯 Type:  ${compType}`);
  console.log(`📅 Ends:  ${competition.endTime || 'unknown'}`);

  if (competition.status === 'completed') {
    console.log(`⚠️  Competition is already completed. Skipping.`);
    return null;
  }

  let prompt = null;
  let mediaUrl = customMediaUrl || null;
  let content = customContent || null;
  let mediaType = 'image';

  if (!dryRun) {
    if (customMediaUrl) {
      // Use provided media URL directly
      mediaType = compType === 'video' ? 'video' : compType === 'writing' ? 'text' : 'image';
      console.log(`📎 Using provided media URL: ${mediaUrl}`);
    } else if (compType === 'video') {
      // Video generation
      if (!tensorslabKey) throw new Error('TENSORSLAB_API_KEY is required for video generation');
      const videoModel = model || 'seedancev2';
      prompt = buildVideoPrompt(competition);
      mediaUrl = await generateVideo(prompt, videoModel);
      mediaType = 'video';
      console.log(`✅ Video generated: ${mediaUrl}`);
    } else if (compType === 'writing' || compType === 'quiz') {
      // Text content
      content = buildTextContent(competition);
      mediaType = 'text';
      console.log(`✅ Text content prepared (${content.length} chars)`);
    } else {
      // Default: image generation (art, coding, etc.)
      if (!tensorslabKey) throw new Error('TENSORSLAB_API_KEY is required for image generation');
      const imageModel = model || 'seedreamv4';
      prompt = buildImagePrompt(competition);
      mediaUrl = await generateImage(prompt, imageModel);
      mediaType = 'image';
      console.log(`✅ Image generated: ${mediaUrl}`);
    }
  } else {
    console.log(`🔍 DRY RUN: Would generate ${compType} content`);
    mediaUrl = 'https://example.com/dry-run-image.png';
    mediaType = 'image';
  }

  // Join competition
  if (!dryRun) {
    await joinCompetition(competitionId, agentId, agentKey);
  } else {
    console.log(`🔍 DRY RUN: Would join competition ${competitionId}`);
  }

  // Submit entry
  let result = null;
  if (!dryRun) {
    result = await submitEntry(competitionId, agentId, agentKey, {
      prompt,
      content,
      mediaUrl,
      mediaType,
    });
    console.log(`🎉 Entry submitted! Entry ID: ${result.id || result.entryId || 'unknown'}`);
  } else {
    console.log(`🔍 DRY RUN: Would submit entry`);
    result = { dryRun: true, competitionId, mediaType };
  }

  const shareUrl = `${arenaUrl}/game/${competitionId}`;
  console.log(`\n🔗 Watch the battle: ${shareUrl}`);

  return {
    competitionId,
    title,
    type: compType,
    prompt,
    mediaUrl,
    mediaType,
    shareUrl,
    result,
  };
}

// ─── A2A Mode ────────────────────────────────────────────────────────────────

/**
 * In A2A mode, poll the task inbox and auto-join any competitions
 * that were announced via A2A protocol.
 */
async function a2aMode(agentId, agentKey, options = {}) {
  const pollSecs = options.pollSecs || 30;
  const processedTasks = new Set();

  console.log(`\n🤖 A2A Mode activated. Polling every ${pollSecs}s for competition announcements...`);
  console.log(`   Agent: ${agentId}`);
  console.log(`   Arena: ${arenaUrl}`);
  console.log(`   Press Ctrl+C to stop.\n`);

  async function pollOnce() {
    try {
      const inbox = await a2aGetInbox(agentKey);
      const tasks = inbox.tasks || inbox || [];

      for (const task of tasks) {
        if (processedTasks.has(task.id)) continue;
        processedTasks.add(task.id);

        console.log(`\n📬 New A2A task received: ${task.id} (state: ${task.state})`);

        // Look for competition data in task messages
        let competitionId = null;
        let battleUrl = null;

        const messages = task.messages || [];
        for (const msg of messages) {
          const parts = msg.parts || [];
          for (const part of parts) {
            // Data part with competition info
            if (part.type === 'data' && part.data?.competitionId) {
              competitionId = part.data.competitionId;
              battleUrl = part.data.battleUrl;
              break;
            }
            // Text part with URL
            if (part.type === 'text' && part.text) {
              const urlMatch = part.text.match(/\/game\/([a-z0-9_-]+)/i);
              if (urlMatch) competitionId = urlMatch[1];
            }
          }
          if (competitionId) break;
        }

        if (!competitionId) {
          console.log(`   ⚠️  No competition ID found in task. Skipping.`);
          // Reply that we couldn't process it
          await a2aReplyTask(task.id, "I couldn't find a competition ID in this message.", 'completed', agentKey).catch(() => {});
          continue;
        }

        console.log(`   🎯 Competition ID: ${competitionId}`);

        try {
          // Reply that we're joining
          await a2aReplyTask(
            task.id,
            `🦞 I'll join competition ${competitionId} now! Generating my entry...`,
            'working',
            agentKey
          ).catch(() => {});

          const joinResult = await autoJoinCompetition(competitionId, agentId, agentKey, options);

          // Reply with success
          if (joinResult) {
            await a2aReplyTask(
              task.id,
              `✅ Successfully joined and submitted entry for "${joinResult.title}"!\n\nWatch the battle: ${joinResult.shareUrl}`,
              'completed',
              agentKey
            ).catch(() => {});
          }
        } catch (joinErr) {
          console.error(`   ❌ Failed to join competition: ${joinErr.message}`);
          await a2aReplyTask(
            task.id,
            `❌ Failed to join competition ${competitionId}: ${joinErr.message}`,
            'failed',
            agentKey
          ).catch(() => {});
        }
      }
    } catch (pollErr) {
      console.error(`⚠️  Polling error: ${pollErr.response?.data?.error || pollErr.message}`);
    }
  }

  // Initial poll
  await pollOnce();

  // Schedule recurring polls
  const interval = setInterval(pollOnce, pollSecs * 1000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping A2A mode...');
    clearInterval(interval);
    process.exit(0);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const agentId   = argValue('--agent-id');
  const agentKey  = argValue('--agent-key') || arenaKey;
  const model     = argValue('--model') || '';
  const content   = argValue('--content') || '';
  const mediaUrl  = argValue('--media-url') || '';
  const dryRun    = hasFlag('--dry-run');
  const a2aModeOn = hasFlag('--a2a-mode');
  const pollSecs  = parseInt(argValue('--poll-secs', '30'), 10);

  if (!agentId || !agentKey) {
    console.error('❌ --agent-id and --agent-key (or CLAW_ARENA_API_KEY) are required.');
    usage();
  }

  const options = {
    model:          model || undefined,
    customContent:  content || undefined,
    customMediaUrl: mediaUrl || undefined,
    dryRun,
    pollSecs,
  };

  if (a2aModeOn) {
    // A2A polling mode
    await a2aMode(agentId, agentKey, options);
    return; // keeps running via setInterval
  }

  // Direct mode: battle URL required
  const battleUrl = process.argv[2];
  if (!battleUrl || battleUrl.startsWith('--')) {
    console.error('❌ Battle URL is required for direct mode.');
    usage();
  }

  const competitionId = extractCompetitionId(battleUrl);
  const result = await autoJoinCompetition(competitionId, agentId, agentKey, options);

  if (result) {
    console.log('\n─── Result ───────────────────────────────────────────────');
    console.log(JSON.stringify(result, null, 2));
  }
}

main().catch(err => {
  const msg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
  console.error(`\n❌ Fatal error: ${msg}`);
  process.exit(1);
});
