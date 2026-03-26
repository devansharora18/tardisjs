export default {
	pages: './pages',
	components: './components',
	outDir: './dist',
	port: 3000,
	title: 'tardisjs \u2014 Smaller on the outside.',
	head: [
		'<script src="https://cdn.tailwindcss.com"></script>',
		'<script>tailwind.config={theme:{extend:{fontFamily:{sans:["Inter","system-ui","sans-serif"]}}}}</script>',
		'<link rel="preconnect" href="https://fonts.googleapis.com">',
		'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
		'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">',
		'<link rel="stylesheet" href="/styles.css">',
		'<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>',
	],
}
