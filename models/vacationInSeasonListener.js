var mongoose - require('mongoose');

var vacationInSeasonListenerSchema = mongoose.Schema({
	email: String,
	skus: [String]
});

var vacationInSeasonListener = mongoose.model('vacationInSeasonListener',
	vacationInSeasonListenerSchema);

module.exports = vacationInSeasonListener;