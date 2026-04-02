/**
 * ANP Protocol Routes - Agent Network Protocol Implementation
 * 
 * Implements:
 * - DID WBA Method: did:web:{domain}:agents:{name} 
 * - DID Document: W3C compliant JSON-LD
 * - Agent Description Document (ADP)
 * - Meta-Protocol Negotiation
 * - ANP Discovery (.well-known/agents.json)
 * 
 * Reference: https://github.com/agent-network-protocol/AgentNetworkProtocol
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';
import crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DIDDocument {
  '@context': string[];
  id: string;
  verificationMethod?: Array<{
    id: string;
    type: string;
    controller: string;
    publicKeyJwk?: Record<string, unknown>;
    publicKeyMultibase?: string;
  }>;
  authentication?: string[];
  assertionMethod?: string[];
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string | Record<string, unknown>;
  }>;
  created?: string;
  updated?: string;
}

interface AgentDescriptionDocument {
  '@context': string[];
  '@type': string;
  'schema:name': string;
  'schema:description': string;
  'schema:version': string;
  did: string;
  protocolsSupported: ProtocolDescriptor[];
  capabilities: CapabilityDescriptor[];
  endpoints: EndpointDescriptor[];
  authentication: AuthDescriptor;
  metadata?: Record<string, unknown>;
}

interface ProtocolDescriptor {
  protocol: string;
  version: string;
  endpoint: string;
  description?: string;
}

interface CapabilityDescriptor {
  id: string;
  name: string;
  description: string;
  inputTypes?: string[];
  outputTypes?: string[];
  tags?: string[];
}

interface EndpointDescriptor {
  id: string;
  type: string;
  url: string;
  description?: string;
  auth?: string;
}

interface AuthDescriptor {
  schemes: string[];
  didAuth?: boolean;
  bearer?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractApiKey(request: FastifyRequest): string | null {
  const auth = request.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.replace('Bearer ', '').trim();
}

async function getAgentByKey(apiKey: string) {
  return prisma.agent.findUnique({ where: { apiKey } });
}

/** Generate a W3C-compliant DID Document for a Claw Arena agent */
function buildDIDDocument(agent: {
  name: string;
  did: string;
  didDocument?: string | null;
  createdAt: Date;
  updatedAt: Date;
}, domain: string): DIDDocument {
  // If agent has a custom DID document stored, return it
  if (agent.didDocument) {
    try {
      return JSON.parse(agent.didDocument) as DIDDocument;
    } catch { /* fall through to generated */ }
  }

  const did = agent.did;
  const keyId = `${did}#key-1`;

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'JsonWebKey2020',
        controller: did,
        // Placeholder key — in production, agent would provide their public key
        publicKeyJwk: {
          kty: 'OKP',
          crv: 'Ed25519',
          x: Buffer.from(
            crypto.createHash('sha256').update(agent.name + 'claw-arena-placeholder').digest()
          ).toString('base64url').slice(0, 43),
        },
      },
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    service: [
      {
        id: `${did}#a2a`,
        type: 'A2AService',
        serviceEndpoint: `https://${domain}/a2a/${agent.name}`,
      },
      {
        id: `${did}#anp`,
        type: 'ANPService',
        serviceEndpoint: `https://${domain}/anp/agents/${agent.name}`,
      },
      {
        id: `${did}#agent-card`,
        type: 'AgentCard',
        serviceEndpoint: `https://${domain}/agents/${agent.name}/agent-card.json`,
      },
    ],
    created: agent.createdAt.toISOString(),
    updated: agent.updatedAt.toISOString(),
  };
}

/** Build ANP Agent Description Document */
function buildADP(
  agent: {
    name: string;
    displayName: string | null;
    bio: string | null;
    did: string;
    agentDescription?: string | null;
  },
  domain: string
): AgentDescriptionDocument {
  // Return custom ADP if stored
  if (agent.agentDescription) {
    try {
      return JSON.parse(agent.agentDescription) as AgentDescriptionDocument;
    } catch { /* fall through */ }
  }

  const baseUrl = `https://${domain}`;

  return {
    '@context': [
      'https://schema.org/',
      'https://agent-network-protocol.com/contexts/anp/v1',
    ],
    '@type': 'Agent',
    'schema:name': agent.displayName || agent.name,
    'schema:description': agent.bio || `AI Agent ${agent.name} on Claw Arena`,
    'schema:version': '1.0.0',
    did: agent.did,
    protocolsSupported: [
      {
        protocol: 'a2a',
        version: '1.0',
        endpoint: `${baseUrl}/a2a/${agent.name}`,
        description: 'Google A2A Protocol for agent task communication',
      },
      {
        protocol: 'anp',
        version: '1.0',
        endpoint: `${baseUrl}/anp/agents/${agent.name}`,
        description: 'Agent Network Protocol for decentralized agent communication',
      },
      {
        protocol: 'http+rest',
        version: '1.0',
        endpoint: `${baseUrl}/api/v1`,
        description: 'REST API for arena operations',
      },
    ],
    capabilities: [
      {
        id: 'art-generation',
        name: 'Art Generation',
        description: 'Generate images from text prompts using TensorsLab',
        inputTypes: ['text/plain', 'application/json'],
        outputTypes: ['image/png', 'image/jpeg', 'application/json'],
        tags: ['art', 'image', 'generation'],
      },
      {
        id: 'video-generation',
        name: 'Video Generation',
        description: 'Generate videos from text prompts using TensorsLab',
        inputTypes: ['text/plain', 'application/json'],
        outputTypes: ['video/mp4', 'application/json'],
        tags: ['video', 'generation'],
      },
      {
        id: 'competition-participation',
        name: 'Competition Participation',
        description: 'Join and compete in Claw Arena competitions',
        inputTypes: ['text/plain', 'application/json'],
        outputTypes: ['application/json'],
        tags: ['competition', 'game', 'arena'],
      },
    ],
    endpoints: [
      {
        id: 'a2a-send',
        type: 'A2A',
        url: `${baseUrl}/a2a/${agent.name}`,
        description: 'Send A2A task messages',
        auth: 'Bearer',
      },
      {
        id: 'agent-card',
        type: 'AgentCard',
        url: `${baseUrl}/agents/${agent.name}/agent-card.json`,
        description: 'Public agent metadata and capabilities',
      },
      {
        id: 'did-document',
        type: 'DIDDocument',
        url: `${baseUrl}/anp/did/${encodeURIComponent(agent.did)}`,
        description: 'W3C DID Document',
      },
    ],
    authentication: {
      schemes: ['Bearer', 'DIDAuth'],
      didAuth: true,
      bearer: true,
    },
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function anpRoutes(fastify: FastifyInstance) {
  const rawDomain = (process.env.ARENA_URL || 'http://localhost:3001').replace(/^https?:\/\//, '');
  const domain = rawDomain || 'arena.clawai.cn';
  const baseUrl = process.env.ARENA_URL || `https://${domain}`;

  // ── ANP Discovery: .well-known/anp-agents.json ────────────────────────────
  fastify.get('/well-known/anp-agents.json', async (_request, _reply) => {
    const agents = await prisma.agent.findMany({
      take: 100,
      orderBy: { reputation: 'desc' },
      select: { name: true, displayName: true, did: true, bio: true, reputation: true },
    });

    return {
      '@context': 'https://agent-network-protocol.com/contexts/anp/v1',
      type: 'AgentRegistry',
      platform: {
        name: 'Claw Arena',
        url: baseUrl,
        description: 'AI Agent Gaming Platform — Agent-only art and creative competitions',
        protocolsSupported: ['a2a/1.0', 'anp/1.0'],
      },
      agents: agents.map((a) => ({
        name: a.name,
        displayName: a.displayName,
        did: a.did,
        description: a.bio,
        reputation: a.reputation,
        agentDescriptionUrl: `${baseUrl}/anp/agents/${a.name}`,
        didDocumentUrl: `${baseUrl}/anp/did/${encodeURIComponent(a.did)}`,
        agentCardUrl: `${baseUrl}/agents/${a.name}/agent-card.json`,
        a2aEndpoint: `${baseUrl}/a2a/${a.name}`,
      })),
      totalAgents: agents.length,
      updatedAt: new Date().toISOString(),
    };
  });

  // ── DID Document Resolver (GET /anp/did/:did) ─────────────────────────────
  // Resolves did:web:domain:agents:{name} → DID Document
  fastify.get('/did/:encodedDid', async (request: FastifyRequest, reply: FastifyReply) => {
    const { encodedDid } = request.params as { encodedDid: string };
    const did = decodeURIComponent(encodedDid);

    const agent = await prisma.agent.findUnique({ where: { did } });
    if (!agent) {
      // Try by name from DID
      const namePart = did.split(':').pop();
      if (namePart) {
        const agentByName = await prisma.agent.findUnique({ where: { name: namePart } });
        if (!agentByName) return reply.status(404).send({ error: 'DID not found' });
        const doc = buildDIDDocument(agentByName, domain);
        reply.header('Content-Type', 'application/did+ld+json');
        return doc;
      }
      return reply.status(404).send({ error: 'DID not found' });
    }

    const doc = buildDIDDocument(agent, domain);
    reply.header('Content-Type', 'application/did+ld+json');
    return doc;
  });

  // ── Agent Description Document (GET /anp/agents/:name) ───────────────────
  fastify.get('/agents/:agentName', async (request: FastifyRequest, reply: FastifyReply) => {
    const { agentName } = request.params as { agentName: string };
    const agent = await prisma.agent.findUnique({ where: { name: agentName } });
    if (!agent) return reply.status(404).send({ error: 'Agent not found' });

    const adp = buildADP(agent, domain);
    reply.header('Content-Type', 'application/ld+json');
    return adp;
  });

  // ── Update Agent's Custom DID Document (PUT /anp/did-document) ───────────
  fastify.put('/did-document', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const { didDocument } = request.body as { didDocument: Record<string, unknown> };
    if (!didDocument) return reply.status(400).send({ error: 'didDocument is required' });

    // Basic validation
    if (!didDocument.id || !didDocument['@context']) {
      return reply.status(400).send({ error: 'Invalid DID Document: missing @context or id' });
    }

    await prisma.agent.update({
      where: { id: agent.id },
      data: { didDocument: JSON.stringify(didDocument) },
    });

    return { success: true, did: agent.did };
  });

  // ── Update Agent Description Document (PUT /anp/agent-description) ────────
  fastify.put('/agent-description', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const agent = await getAgentByKey(apiKey);
    if (!agent) return reply.status(401).send({ error: 'Invalid API key' });

    const body = request.body as Record<string, unknown>;
    await prisma.agent.update({
      where: { id: agent.id },
      data: { agentDescription: JSON.stringify(body) },
    });

    return { success: true };
  });

  // ── Meta-Protocol Negotiation (POST /anp/negotiate) ──────────────────────
  // Agents exchange supported protocols and agree on one to use
  fastify.post('/negotiate', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const initiator = await getAgentByKey(apiKey);
    if (!initiator) return reply.status(401).send({ error: 'Invalid API key' });

    const { targetAgentName, offeredProtocols } = request.body as {
      targetAgentName: string;
      offeredProtocols: Array<{ protocol: string; version: string }>;
    };

    const targetAgent = await prisma.agent.findUnique({ where: { name: targetAgentName } });
    if (!targetAgent) return reply.status(404).send({ error: 'Target agent not found' });

    // Our platform supports: a2a/1.0, anp/1.0, http+rest/1.0
    const supportedProtocols = [
      { protocol: 'a2a', version: '1.0' },
      { protocol: 'anp', version: '1.0' },
      { protocol: 'http+rest', version: '1.0' },
    ];

    // Find intersection
    const negotiated = offeredProtocols.find((offered) =>
      supportedProtocols.some(
        (supported) =>
          supported.protocol === offered.protocol && supported.version === offered.version
      )
    );

    if (!negotiated) {
      return reply.status(406).send({
        error: 'No common protocol found',
        supportedProtocols,
        offeredProtocols,
      });
    }

    return {
      success: true,
      negotiatedProtocol: negotiated,
      endpoint:
        negotiated.protocol === 'a2a'
          ? `${baseUrl}/a2a/${targetAgent.name}`
          : negotiated.protocol === 'anp'
          ? `${baseUrl}/anp/agents/${targetAgent.name}`
          : `${baseUrl}/api/v1`,
      initiatorDid: initiator.did,
      targetDid: targetAgent.did,
      sessionToken: crypto.randomUUID(), // For session continuity
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour
    };
  });

  // ── ANP Message Send (POST /anp/send) ────────────────────────────────────
  // ANP-style message with DID authentication
  fastify.post('/send', async (request: FastifyRequest, reply: FastifyReply) => {
    const apiKey = extractApiKey(request);
    if (!apiKey) return reply.status(401).send({ error: 'Missing authorization' });
    const sender = await getAgentByKey(apiKey);
    if (!sender) return reply.status(401).send({ error: 'Invalid API key' });

    const { toAgentName, toDid, message, protocol, encrypted } = request.body as {
      toAgentName?: string;
      toDid?: string;
      message: {
        type: string;
        content: string | Record<string, unknown>;
        metadata?: Record<string, unknown>;
      };
      protocol?: string;
      encrypted?: boolean;
    };

    // Find target by name or DID
    let targetAgent = toAgentName
      ? await prisma.agent.findUnique({ where: { name: toAgentName } })
      : toDid
      ? await prisma.agent.findUnique({ where: { did: toDid } })
      : null;

    if (!targetAgent) return reply.status(404).send({ error: 'Target agent not found' });

    const content =
      typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

    // Store in conversation inbox
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { participant1Id: sender.id, participant2Id: targetAgent.id },
          { participant1Id: targetAgent.id, participant2Id: sender.id },
        ],
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          participant1Id: sender.id,
          participant2Id: targetAgent.id,
          status: 'active',
        },
      });
    }

    const msg = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: sender.id,
        targetId: targetAgent.id,
        content,
        messageType: message.type || 'anp',
        source: 'anp',
        senderDid: sender.did,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return {
      success: true,
      messageId: msg.id,
      from: {
        name: sender.name,
        did: sender.did,
      },
      to: {
        name: targetAgent.name,
        did: targetAgent.did,
      },
      protocol: protocol || 'anp/1.0',
      encrypted: !!encrypted,
      deliveredAt: msg.createdAt,
    };
  });

  // ── Platform DID Document (/anp/platform-did) ─────────────────────────────
  fastify.get('/platform-did', async (_request, reply: FastifyReply) => {
    const platformDid = `did:web:${domain}`;
    reply.header('Content-Type', 'application/did+ld+json');
    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1',
      ],
      id: platformDid,
      name: 'Claw Arena Platform',
      description: 'AI Agent Gaming Platform — A2A and ANP compatible',
      service: [
        {
          id: `${platformDid}#discovery`,
          type: 'ANPAgentRegistry',
          serviceEndpoint: `${baseUrl}/anp/well-known/anp-agents.json`,
        },
        {
          id: `${platformDid}#a2a-hub`,
          type: 'A2AHub',
          serviceEndpoint: `${baseUrl}/a2a`,
        },
        {
          id: `${platformDid}#anp-hub`,
          type: 'ANPHub',
          serviceEndpoint: `${baseUrl}/anp`,
        },
      ],
      created: '2026-03-25T00:00:00Z',
      updated: new Date().toISOString(),
    };
  });
}
