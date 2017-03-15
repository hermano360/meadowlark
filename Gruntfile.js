module.exports = function(grunt){

	// load plugins
	[
		'grunt-contrib-jshint',
		'grunt-exec',
	].forEach(function(task){
		grunt.loadNpmTasks(task);
	});

	// configure plugins
	grunt.initConfig({
		jshint: {
			app: ['meadowlark.js', 'public/js/**/*.js', 'lib/**/*.js'],
			qa: ['Gruntfile.js', 'public/qa/**/*.js', 'qa/**/*.js']
		},
		exec: {
			linkchecker: { cmd: 'linkchecker http://localhost:3000' }
		},
	});	

	// register tasks
	grunt.registerTask('default', ['jshint','exec']);
};
