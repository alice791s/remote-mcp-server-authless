import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Типизация для результатов поиска Brave API (только нужные поля)
interface BraveSearchResult {
    title: string;
    url: string;
    description: string;
}

// Определяем наш MCP агент с инструментом поиска
export class MySearchAgent extends McpAgent {
	server = new McpServer({
		name: "Web Search Agent",
		version: "1.0.0",
	});

	async init() {
		// Убираем старые инструменты калькулятора и добавляем новый
		this.server.tool(
			"search", // Имя инструмента
			{
				// Входные данные: ожидаем один строковый параметр 'query'
				query: z.string().describe("The search query to look up on the internet"),
			},
			async ({ query }, { env }) => { // {env} - это контекст, дающий доступ к секретам
				console.log(`[Search] Received query: ${query}`);

                // 1. Проверяем наличие API ключа
                const apiKey = env.BRAVE_API_KEY;
                if (!apiKey) {
                    console.error("BRAVE_API_KEY is not set in environment secrets.");
                    return {
                        content: [{ type: "text", text: "Error: Search API key is not configured by the administrator." }],
                    };
                }

                // 2. Формируем и выполняем запрос к Brave API
                const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`;
                
                try {
                    const response = await fetch(url, {
                        headers: {
                            "Accept": "application/json",
                            "X-Subscription-Token": apiKey,
                        },
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Brave API error: ${response.status} ${errorText}`);
                    }

                    const data = await response.json();
                    
                    // 3. Обрабатываем и форматируем результаты
                    const webResults = data.web?.results as BraveSearchResult[] || [];

                    if (webResults.length === 0) {
                        return { content: [{ type: "text", text: "No relevant search results found." }] };
                    }

                    // Собираем результаты в одну удобную для LLM строку
                    const formattedResults = webResults
                        .slice(0, 5) // Берем только первые 5 результатов
                        .map(result => 
`Title: ${result.title}
URL: ${result.url}
Snippet: ${result.description}`
                        )
                        .join("\n\n---\n\n"); // Разделяем результаты

                    return { content: [{ type: "text", text: formattedResults }] };

                } catch (error) {
                    console.error(`[Search] Critical fetch error: ${error}`);
                    return {
                        content: [{ type: "text", text: `Error: Failed to perform search. Details: ${error.message}` }],
                    };
                }
			}
		);
	}
}

// Этот блок остается почти без изменений. Он отвечает за "маршрутизацию" запросов к вашему агенту.
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Мы будем использовать стандартный эндпоинт /mcp
		if (url.pathname === "/mcp") {
			return MySearchAgent.serve("/mcp").fetch(request, env, ctx);
		}

		// Можно добавить "корневую" страницу для проверки
		if (url.pathname === "/") {
			return new Response("MySearchAgent is running. Use the /mcp endpoint to interact.", { status: 200 });
		}

		return new Response("Not found. Use the /mcp endpoint.", { status: 404 });
	},
};

// Определяем тип для переменных окружения (важно для TypeScript)
export interface Env {
    BRAVE_API_KEY: string;
}```

