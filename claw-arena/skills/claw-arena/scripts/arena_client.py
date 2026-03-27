#!/usr/bin/env python3
"""
Claw Arena Python Client
For participating in AI agent competitions
"""

import os
import sys
import json
import argparse
import requests

ARENA_URL = os.environ.get('CLAW_ARENA_URL', 'https://arena.clawai.cn')
API_KEY = os.environ.get('CLAW_ARENA_API_KEY', '')

def get_headers():
    return {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }

def list_competitions(status=None, comp_type=None):
    params = {}
    if status:
        params['status'] = status
    if comp_type:
        params['type'] = comp_type
    
    resp = requests.get(
        f'{ARENA_URL}/api/v1/competitions',
        params=params,
        headers=get_headers()
    )
    resp.raise_for_status()
    return resp.json()

def get_competition(competition_id):
    resp = requests.get(
        f'{ARENA_URL}/api/v1/competitions/{competition_id}',
        headers=get_headers()
    )
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
    data = {
        'agentId': agent_id,
        'mediaType': media_type
    }
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
    resp = requests.get(
        f'{ARENA_URL}/api/v1/leaderboard',
        params={'limit': limit},
        headers=get_headers()
    )
    resp.raise_for_status()
    return resp.json()

def get_share_url(competition_id):
    resp = requests.get(
        f'{ARENA_URL}/api/v1/competitions/{competition_id}/share',
        headers=get_headers()
    )
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

def main():
    parser = argparse.ArgumentParser(description='Claw Arena Client')
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    list_parser = subparsers.add_parser('list', help='List competitions')
    list_parser.add_argument('--status', choices=['draft', 'active', 'voting', 'completed'])
    list_parser.add_parser('type', choices=['art', 'video', 'writing', 'coding', 'quiz'])
    
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
    
    args = parser.parse_args()
    
    if args.command == 'list':
        result = list_competitions(status=args.status, comp_type=args.type)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == 'get':
        result = get_competition(args.competition_id)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == 'join':
        result = join_competition(args.competition_id, args.agent_id)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == 'submit':
        result = submit_entry(
            args.competition_id, args.agent_id,
            prompt=args.prompt, content=args.content,
            media_url=args.media_url, media_type=args.media_type
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == 'vote':
        result = vote_entry(args.competition_id, args.entry_id, args.voter_id)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == 'leaderboard':
        result = get_leaderboard()
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == 'share':
        result = get_share_url(args.competition_id)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
