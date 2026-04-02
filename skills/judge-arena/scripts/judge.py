#!/usr/bin/env python3
"""
Judge Arena - Competition Management Script
"""

import os
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

def create_competition(title, comp_type, description='', rules='', max_participants=50, start_time=None, end_time=None):
    data = {
        'title': title,
        'type': comp_type,
        'description': description,
        'rules': rules,
        'maxParticipants': max_participants
    }
    if start_time:
        data['startTime'] = start_time
    if end_time:
        data['endTime'] = end_time
    
    resp = requests.post(
        f'{ARENA_URL}/api/v1/competitions',
        headers=get_headers(),
        json=data
    )
    resp.raise_for_status()
    return resp.json()

def start_competition(competition_id):
    resp = requests.post(
        f'{ARENA_URL}/api/v1/competitions/{competition_id}/start',
        headers=get_headers()
    )
    resp.raise_for_status()
    return resp.json()

def end_competition(competition_id):
    resp = requests.post(
        f'{ARENA_URL}/api/v1/competitions/{competition_id}/end',
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

def list_competitions(status=None):
    params = {}
    if status:
        params['status'] = status
    
    resp = requests.get(
        f'{ARENA_URL}/api/v1/competitions',
        params=params,
        headers=get_headers()
    )
    resp.raise_for_status()
    return resp.json()

def main():
    parser = argparse.ArgumentParser(description='Judge Arena - Competition Management')
    subparsers = parser.add_subparsers(dest='command')
    
    create_parser = subparsers.add_parser('create', help='Create competition')
    create_parser.add_argument('title')
    create_parser.add_argument('type', choices=['art', 'video', 'writing', 'coding', 'quiz'])
    create_parser.add_argument('--description', '-d')
    create_parser.add_argument('--rules', '-r')
    create_parser.add_argument('--max', '-m', type=int, default=50)
    create_parser.add_argument('--start')
    create_parser.add_argument('--end')
    
    subparsers.add_parser('list', help='List competitions')
    subparsers.add_parser('list', help='List competitions')
    list_parser = subparsers.add_parser('list', help='List competitions')
    list_parser.add_argument('--status')
    
    get_parser = subparsers.add_parser('get', help='Get competition')
    get_parser.add_argument('competition_id')
    
    start_parser = subparsers.add_parser('start', help='Start competition')
    start_parser.add_argument('competition_id')
    
    end_parser = subparsers.add_parser('end', help='End competition')
    end_parser.add_argument('competition_id')
    
    args = parser.parse_args()
    
    if args.command == 'create':
        result = create_competition(
            args.title, args.type,
            description=args.description or '',
            rules=args.rules or '',
            max_participants=args.max,
            start_time=args.start,
            end_time=args.end
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == 'list':
        result = list_competitions(status=args.status)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == 'get':
        result = get_competition(args.competition_id)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == 'start':
        result = start_competition(args.competition_id)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    elif args.command == 'end':
        result = end_competition(args.competition_id)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        parser.print_help()

if __name__ == '__main__':
    main()
