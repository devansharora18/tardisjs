export default {
	pages: './pages',
	components: './components',
	outDir: './dist',
	port: 3000,
	title: 'tardisjs — blueprint-first frontend framework',
	head: [
		'<link rel="preconnect" href="https://fonts.googleapis.com">',
		'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
		'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">',
		'<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">',
		'<link rel="stylesheet" href="/styles.css">',
		'<script type="importmap">{"imports":{"@vercel/analytics":"https://esm.sh/@vercel/analytics"}}</script>',
		'<script type="module">import { inject } from "@vercel/analytics"; inject({ mode: "production" });</script>',
	],
}
