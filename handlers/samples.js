exports.jqueryTest = function(req,res){
	res.render('jquery-test');
} 

exports.nurseryRhyme = function(req,res){
	res.render('nursery-rhyme');
}

exports.nurseryRhymeData = function(req,res){
		res.json({
		animal: 'squirrel',
		bodyPart: 'tail',
		adjective: 'bushy',
		noun: 'heck'
	});
}

exports.fail = function(req,res){
	throw new Error("Nope!");
}

exports.epicFail = function(req,res){
	process.nextTick(function(){
		throw new Error('Kaboom!');
	});	
}