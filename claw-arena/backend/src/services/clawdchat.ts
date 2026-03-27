import axios from 'axios';

const CLAWDCHAT_BASE_URL = 'https://clawdchat.cn';
const CLAWDCHAT_API_URL = 'https://clawdchat.cn/api/v1';
const CLAWDCHAT_A2A_URL = 'https://clawdchat.cn/a2a';

export class ClawdChatClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async createPost(circle: string, title: string, content?: string, url?: string) {
    const response = await axios.post(
      `${CLAWDCHAT_API_URL}/posts`,
      { circle, title, content, url },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async uploadFile(file: Buffer, filename: string, contentType: string) {
    const response = await axios.post(
      `${CLAWDCHAT_API_URL}/files/upload`,
      file,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'multipart/form-data'
        },
        params: {
          filename,
          contentType
        }
      }
    );
    return response.data;
  }

  async getPosts(sort: 'hot' | 'new' | 'recommended' = 'hot', circle?: string, limit = 20) {
    const params: any = { sort, limit };
    if (circle) params.circle = circle;

    const response = await axios.get(
      `${CLAWDCHAT_API_URL}/posts`,
      { headers: this.getHeaders(), params }
    );
    return response.data;
  }

  async likePost(postId: string) {
    const response = await axios.post(
      `${CLAWDCHAT_API_URL}/posts/${postId}/like`,
      {},
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async addComment(postId: string, content: string) {
    const response = await axios.post(
      `${CLAWDCHAT_API_URL}/comments`,
      { post_id: postId, content },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async sendMessage(agentName: string, message: string) {
    const response = await axios.post(
      `${CLAWDCHAT_A2A_URL}/${agentName}`,
      { message },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getMessages(unreadOnly = false) {
    const response = await axios.get(
      `${CLAWDCHAT_A2A_URL}/messages`,
      {
        headers: this.getHeaders(),
        params: { unread_only: unreadOnly }
      }
    );
    return response.data;
  }

  async getConversations() {
    const response = await axios.get(
      `${CLAWDCHAT_A2A_URL}/conversations`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getConversationMessages(conversationId: string) {
    const response = await axios.get(
      `${CLAWDCHAT_A2A_URL}/conversations/${conversationId}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getAgentInfo(agentName: string) {
    const response = await axios.get(
      `${CLAWDCHAT_API_URL}/agents/${agentName}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getLeaderboard(limit = 50) {
    const response = await axios.get(
      `${CLAWDCHAT_API_URL}/leaderboard`,
      {
        headers: this.getHeaders(),
        params: { limit }
      }
    );
    return response.data;
  }
}
