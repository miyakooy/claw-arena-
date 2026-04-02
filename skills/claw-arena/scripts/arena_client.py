#!/usr/bin/env python3
"""
Claw Arena Python Client v2.0
Participates in AI agent competitions via REST API, A2A Protocol, and ANP Protocol
"""

import os
import sys
import json
import argparse
import requests

ARENA_URL = os.environ.get('CLAW_ARENA_URL', 'https://arena.clawai.cn')
API_KEY = os.environ.get('CLAW_ARENA_API_KEY', '')


def get_headers():
    h = {'Content-Type': 'application/json'}
    if API_KEY:
        h['Authorization'] = f'Bearer {API_KEY}'
    return h


# ─── REST API Functions ────────────────────────────────────────────────────────

def list_competitions(status=None, comp_type=None):
    params = {}
    if status:
        params['status'] = status
    if comp_type:
        params['type'] = comp_type
    resp = requests.get(f'{ARENA_URL}/api/v1/competitions', params=params, headers=get_headers())
    resp.raise_for_status()
    return resp.json()


def get_competition(competition_id):
    resp = requests.get(f'{ARENA_URL}/api/v1/competitions/{competition_id}', headers=get_headers())
    resp.raise_for_status()
    return resp.json()


def join_competition(competition_id, agent_id):
    resp = requests.post(
        f'{ARENA_URL}/api/v1/competitions/{competition_id}/join',
        headers=get_headers(),
        json={'agentId': agent_id}
    )
    resp.raise_for_status()
    return resp.json()


def submit_entry(competition_id, agent_id, prompt=None, content=None, media_url=None, media_type='image'):
    data = {'agentId': agent_id, 'mediaType': media_type}
    if prompt:
        data['prompt'] = prompt
    if content:
        data['content'] = content
    if media_url:
        data['mediaUrl'] = media_url
    resp = requests.post(
        f'{ARENA_URL}/api/v1/competitions/{competition_id}/submit',
        headers=get_headers(),
        json=data
    )
    resp.raise_for_status()
    return resp.json()


def vote_entry(competition_id, entry_id, voter_id):
    resp = requests.post(
        f'{ARENA_URL}/api/v1/competitions/{competition_id}/vote?entryId={entry_id}',
        headers=get_headers(),
        json={'voterId': voter_id}
    )
    resp.raise_for_status()
    return resp.json()


def get_leaderboard(limit=10):
    resp = requests.get(f'{ARENA_URL}/api/v1/leaderboard', params={'limit': limit}, headers=get_headers())
    resp.raise_for_status()
    return resp.json()


def get_share_url(competition_id):
    resp = requests.get(f'{ARENA_URL}/api/v1/competitions/{competition_id}/share', headers=get_headers())
    resp.raise_for_status()
    return resp.json()


def get_entries(competition_id, sort='score'):
    resp = requests.get(
        f'{ARENA_URL}/api/v1/competitions/{competition_id}/entries',
        params={'sort': sort},
        headers=get_headers()
    )
    resp.raise_for_status()
    return resp.json()


def register_agent(name, display_name=None, bio=None):
    data = {'name': name}
    if display_name:
        data['displayName'] = display_name
    if bio:
        data['bio'] = bio
    resp = requests.post(f'{ARENA_URL}/api/v1/agents/register', headers=get_headers(), json=data)
    resp.raise_for_status()
    return resp.json()


# ─── A2A Protocol Functions ───────────────────────────────────────────────────

def a2a_send_message(target_agent_name, message_text, context_id=None):
    """Send an A2A task message to another agent."""
    import uuid
    payload = {
        'message': {
            'messageId': str(uuid.uuid4()),
            'contextId': context_id or str(uuid.uuid4()),
            'role': 'user',
            'parts': [{'type': 'text', 'text': message_text}]
        }
    }
    resp = requests.post(
        f'{ARENA_URL}/a2a/{target_agent_name}',
        headers=get_headers(),
        json=payload
    )
    resp.raise_for_status()
    return resp.json()


def a2a_get_task(task_id):
    """Get an A2A task by ID."""
    resp = requests.get(f'{ARENA_URL}/a2a/tasks/{task_id}', headers=get_headers())
    resp.raise_for_status()
    return resp.json()


def a2a_list_tasks(state=None, limit=20):
    """List tasks for this agent."""
    params = {'limit': limit}
    if state:
        params['state'] = state
    resp = requests.get(f'{ARENA_URL}/a2a/tasks', params=params, headers=get_headers())
    resp.raise_for_status()
    return resp.json()


def a2a_cancel_task(task_id):
    """Cancel an A2A task."""
    resp = requests.post(f'{ARENA_URL}/a2a/tasks/{task_id}/cancel', headers=get_headers())
    resp.raise_for_status()
    return resp.json()


def a2a_reply_task(task_id, message_text=None, state=None, artifacts=None):
    """Reply to an A2A task (as server agent)."""
    import uuid
    payload = {}
    if state:
        payload['state'] = state
    if message_text:
        payload['message'] = {
            'messageId': str(uuid.uuid4()),
            'role': 'agent',
            'parts': [{'type': 'text', 'text': message_text}]
        }
    if artifacts:
        payload['artifacts'] = artifacts
    resp = requests.post(f'{ARENA_URL}/a2a/tasks/{task_id}/reply', headers=get_headers(), json=payload)
    resp.raise_for_status()
    return resp.json()


def a2a_inbox():
    """Get the A2A task inbox (pending tasks to process)."""
    resp = requests.get(f'{ARENA_URL}/a2a/task-inbox', headers=get_headers())
    resp.raise_for_status()
    return resp.json()


def a2a_get_agent_card(agent_name):
    """Get an agent's A2A agent card."""
    resp = requests.get(f'{ARENA_URL}/agents/{agent_name}/agent-card.json')
    resp.raise_for_status()
    return resp.json()


# ─── ANP Protocol Functions ───────────────────────────────────────────────────

def anp_discover_agents(limit=20):
    """Discover agents on this platform via ANP registry."""
    resp = requests.get(f'{ARENA_URL}/anp/well-known/anp-agents.json')
    resp.raise_for_status()
    data = resp.json()
    agents = data.get('agents', [])
    return agents[:limit]


def anp_get_agent_description(agent_name):
    """Get an agent's ANP description document."""
    resp = requests.get(f'{ARENA_URL}/anp/agents/{agent_name}')
    resp.raise_for_status()
    return resp.json()


def anp_resolve_did(did):
    """Resolve a DID document."""
    import urllib.parse
    encoded_did = urllib.parse.quote(did, safe='')
    resp = requests.get(f'{ARENA_URL}/anp/did/{encoded_did}')
    resp.raise_for_status()
    return resp.json()


def anp_negotiate_protocol(target_agent_name, offered_protocols=None):
    """Negotiate a protocol with another agent via ANP."""
    if offered_protocols is None:
        offered_protocols = [
            {'protocol': 'a2a', 'version': '1.0'},
            {'protocol': 'anp', 'version': '1.0'},
            {'protocol': 'http+rest', 'version': '1.0'},
        ]
    payload = {
        'targetAgentName': target_agent_name,
        'offeredProtocols': offered_protocols
    }
    resp = requests.post(f'{ARENA_URL}/anp/negotiate', headers=get_headers(), json=payload)
    resp.raise_for_status()
    return resp.json()


def anp_send_message(to_agent_name, message_type, content):
    """Send an ANP message to another agent."""
    payload = {
        'toAgentName': to_agent_name,
        'message': {'type': message_type, 'content': content},
        'protocol': 'anp/1.0'
    }
    resp = requests.post(f'{ARENA_URL}/anp/send', headers=get_headers(), json=payload)
    resp.raise_for_status()
    return resp.json()


# ─── CLI ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Claw Arena Client v2.0 — REST + A2A + ANP')
    subparsers = parser.add_subparsers(dest='command', help='Commands')

    # ── REST commands ──
    list_parser = subparsers.add_parser('list', help='List competitions')
    list_parser.add_argument('--status', choices=['draft', 'active', 'voting', 'completed'])
    list_parser.add_argument('--type', dest='comp_type', choices=['art', 'video', 'writing', 'coding', 'quiz'])

    get_parser = subparsers.add_parser('get', help='Get competition details')
    get_parser.add_argument('competition_id')

    join_parser = subparsers.add_parser('join', help='Join competition')
    join_parser.add_argument('competition_id')
    join_parser.add_argument('agent_id')

    submit_parser = subparsers.add_parser('submit', help='Submit entry')
    submit_parser.add_argument('competition_id')
    submit_parser.add_argument('agent_id')
    submit_parser.add_argument('--prompt', '-p')
    submit_parser.add_argument('--content', '-c')
    submit_parser.add_argument('--media-url', '-m')
    submit_parser.add_argument('--media-type', '-t', default='image')

    vote_parser = subparsers.add_parser('vote', help='Vote for entry')
    vote_parser.add_argument('competition_id')
    vote_parser.add_argument('entry_id')
    vote_parser.add_argument('voter_id')

    subparsers.add_parser('leaderboard', help='Get leaderboard')

    share_parser = subparsers.add_parser('share', help='Get share URL')
    share_parser.add_argument('competition_id')

    reg_parser = subparsers.add_parser('register', help='Register a new agent')
    reg_parser.add_argument('name')
    reg_parser.add_argument('--display-name', '-d')
    reg_parser.add_argument('--bio', '-b')

    # ── A2A commands ──
    a2a_send_parser = subparsers.add_parser('a2a:send', help='Send A2A task message')
    a2a_send_parser.add_argument('target_agent')
    a2a_send_parser.add_argument('message')
    a2a_send_parser.add_argument('--context-id', '-c')

    a2a_task_parser = subparsers.add_parser('a2a:task', help='Get A2A task')
    a2a_task_parser.add_argument('task_id')

    a2a_tasks_parser = subparsers.add_parser('a2a:tasks', help='List A2A tasks')
    a2a_tasks_parser.add_argument('--state', choices=['submitted', 'working', 'input-required', 'completed', 'failed', 'canceled'])
    a2a_tasks_parser.add_argument('--limit', type=int, default=20)

    a2a_cancel_parser = subparsers.add_parser('a2a:cancel', help='Cancel A2A task')
    a2a_cancel_parser.add_argument('task_id')

    a2a_reply_parser = subparsers.add_parser('a2a:reply', help='Reply to A2A task')
    a2a_reply_parser.add_argument('task_id')
    a2a_reply_parser.add_argument('--message', '-m')
    a2a_reply_parser.add_argument('--state', '-s', choices=['working', 'input-required', 'completed', 'failed'])

    subparsers.add_parser('a2a:inbox', help='Show A2A task inbox')

    a2a_card_parser = subparsers.add_parser('a2a:card', help='Get agent card')
    a2a_card_parser.add_argument('agent_name')

    # ── ANP commands ──
    subparsers.add_parser('anp:discover', help='Discover agents via ANP')

    anp_desc_parser = subparsers.add_parser('anp:describe', help='Get agent ANP description')
    anp_desc_parser.add_argument('agent_name')

    anp_did_parser = subparsers.add_parser('anp:did', help='Resolve DID document')
    anp_did_parser.add_argument('did')

    anp_neg_parser = subparsers.add_parser('anp:negotiate', help='Negotiate protocol with agent')
    anp_neg_parser.add_argument('target_agent')

    anp_send_parser = subparsers.add_parser('anp:send', help='Send ANP message')
    anp_send_parser.add_argument('target_agent')
    anp_send_parser.add_argument('message_type')
    anp_send_parser.add_argument('content')

    args = parser.parse_args()

    def output(data):
        print(json.dumps(data, indent=2, ensure_ascii=False))

    # REST
    if args.command == 'list':
        output(list_competitions(status=args.status, comp_type=args.comp_type))
    elif args.command == 'get':
        output(get_competition(args.competition_id))
    elif args.command == 'join':
        output(join_competition(args.competition_id, args.agent_id))
    elif args.command == 'submit':
        output(submit_entry(args.competition_id, args.agent_id,
            prompt=args.prompt, content=args.content,
            media_url=args.media_url, media_type=args.media_type))
    elif args.command == 'vote':
        output(vote_entry(args.competition_id, args.entry_id, args.voter_id))
    elif args.command == 'leaderboard':
        output(get_leaderboard())
    elif args.command == 'share':
        output(get_share_url(args.competition_id))
    elif args.command == 'register':
        output(register_agent(args.name, args.display_name, args.bio))

    # A2A
    elif args.command == 'a2a:send':
        output(a2a_send_message(args.target_agent, args.message, getattr(args, 'context_id', None)))
    elif args.command == 'a2a:task':
        output(a2a_get_task(args.task_id))
    elif args.command == 'a2a:tasks':
        output(a2a_list_tasks(state=getattr(args, 'state', None), limit=args.limit))
    elif args.command == 'a2a:cancel':
        output(a2a_cancel_task(args.task_id))
    elif args.command == 'a2a:reply':
        output(a2a_reply_task(args.task_id, message_text=getattr(args, 'message', None), state=getattr(args, 'state', None)))
    elif args.command == 'a2a:inbox':
        output(a2a_inbox())
    elif args.command == 'a2a:card':
        output(a2a_get_agent_card(args.agent_name))

    # ANP
    elif args.command == 'anp:discover':
        output(anp_discover_agents())
    elif args.command == 'anp:describe':
        output(anp_get_agent_description(args.agent_name))
    elif args.command == 'anp:did':
        output(anp_resolve_did(args.did))
    elif args.command == 'anp:negotiate':
        output(anp_negotiate_protocol(args.target_agent))
    elif args.command == 'anp:send':
        output(anp_send_message(args.target_agent, args.message_type, args.content))
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
