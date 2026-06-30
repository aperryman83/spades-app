/**
 * coach/lines.js
 *
 * Uncle Ray's Voice Library — 100+ lines organized by game moment.
 *
 * Every line in here passed the "would a real uncle who loves you say this
 * at a kitchen table?" test. The register comes from absorbing comedian
 * transcripts (Cedric, JB Smoove, Katt Williams, D.L. Hughley) — not
 * copying their jokes, but inheriting how they BUILD a thought.
 *
 * Voice rules baked in:
 *   - No "Baby" / "Sweetie" / "Honey" — uncle energy, not auntie energy
 *   - Emphasis carries weight: CAPS on the word that MATTERS
 *   - No surface-level 'in' for 'ing' drops — rhythm > slang
 *   - When disappointed, get quieter and more specific. Never louder.
 *   - Kill setup words. Just speak.
 *   - The lesson lives inside the observation.
 *   - "We" not "you" — partnership framing.
 *
 * Usage:
 *   import { getLine, getLines } from './lines.js';
 *   const line = getLine('BIDDING_QUESTION');      // random single line
 *   const all  = getLines('TRICK_WIN_TEAM');        // full array
 */
// ═════════════════════════════════════════════════════════════════════════════
// HELPER — Random selection
// ═════════════════════════════════════════════════════════════════════════════
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
// ═════════════════════════════════════════════════════════════════════════════
// LINE LIBRARY — Organized by game moment
// ═════════════════════════════════════════════════════════════════════════════
const LINES = {
  // ─────────────────────────────────────────────────────────────────────────
  // BIDDING PHASE
  // ─────────────────────────────────────────────────────────────────────────
  BIDDING_QUESTION: [
    `Look at your hand. What you feel strong in? Count the ones you KNOW you can take.`,
    `What's jumping out at you? Don't think about what MIGHT happen — what do you KNOW?`,
    `How many of those you holding would win if you led 'em right now? That's your damn floor.`,
    `You got power or you got potential? There's a difference. Count the power first.`,
    `Which suit you running? That's where your bid starts.`,
    `Before you bid, tell me — what can NOBODY take from you?`,
    `You see anything in there that scares you? Good. Now count what doesn't.`,
    `Forget the whole hand for a second. How many aces you sitting on?`,
  ],
  BIDDING_NUDGE: [
    `I got thoughts if you want 'em.`,
    `Whenever you ready. I ain't going no damn where.`,
    `Take your time. A rushed bid is a broken round.`,
    `I could tell you what I see, but you need to see it first.`,
    `You already know more than you think. Trust that shit.`,
  ],
  BIDDING_CONFIDENT: [
    `That's a hand right there. You KNOW what you got.`,
    `Sheeeeit. I like what I'm looking at. You should too.`,
    `That hand got weight to it. Bid with your chest.`,
    `You sitting on something. Don't be humble about it.`,
  ],
  BIDDING_CAUTIOUS: [
    `This one's tricky. Don't let hope do your counting.`,
    `I wouldn't get greedy with this one. Bid what you can damn well PROVE.`,
    `Some hands are workers, not winners. This might be one of those.`,
    `That hand got some question marks in it. Bid the sure things.`,
  ],
  BIDDING_NIL_POSSIBLE: [
    `You might be holding a nil hand. Look again — any card in there that could accidentally win?`,
    `That hand is LOW. If you trust your partner, this could be a nil. Sheeeeit.`,
    `I've seen nil hands my whole life. This one got the damn look.`,
  ],
  ALL_BIDS_OVERBID: [
    `Somebody at this table is lying. {totalBid} total bids on 13 tricks. Sheeeeit.`,
    `{totalBid} bids on 13 tricks. The math don't damn math. Somebody getting set tonight.`,
    `That's {totalBid} between everybody. Last I checked, the deck ain't got but 13 tricks in it. Somebody full of shit.`,
    `{totalBid} on 13. One of these fools is writing checks their hand can't cash.`,
  ],
  ALL_BIDS_STRONG: [
    `We came to play. {teamBid} between us. Let's get it.`,
    `{teamBid} is the number. We BEEN ready for this.`,
    `I like our number. {teamBid} is doable if we play smart.`,
    `{teamBid} between us. That's not greedy, that's honest. Let's damn work.`,
  ],
  ALL_BIDS_LIGHT: [
    `We playing conservative. Nothing wrong with that — just make what we bid.`,
    `Light bid. That means no damn mistakes, no free tricks for them.`,
    `We ain't trying to be heroes. Make the bid. Control the damn bags.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // PLAY PHASE — Human's turn
  // ─────────────────────────────────────────────────────────────────────────
  PLAY_LEAD_STRONG: [
    `You leading? Lead with something that makes a damn statement.`,
    `When you lead, lead like you MEAN it. Make them react to you.`,
    `You got the floor. What you want to say with it?`,
    `Your lead sets the whole trick. What story you telling?`,
  ],
  PLAY_FOLLOW_HIGH: [
    `You can take this. Put some authority on it.`,
    `This one's there for the taking. Don't leave that shit on the table.`,
    `We need this trick. Play the one that ends the damn conversation.`,
  ],
  PLAY_FOLLOW_LOW: [
    `Nothing to prove here. Throw low and save your power.`,
    `This ain't our trick. Let that shit go. We'll get ours.`,
    `Partner got this or we don't need it. Save what you got.`,
    `Play small. Not every trick is worth fighting for.`,
  ],
  PLAY_TRUMP_DECISION: [
    `You thinking about cutting? Make damn sure it's worth the spade.`,
    `Spades don't grow on trees. If you cutting, make it count.`,
    `You can take this with trump but ask yourself — do we NEED it?`,
  ],
  PLAY_PARTNER_WINNING: [
    `Partner got this one. Don't get in the damn way of your own team.`,
    `Your partner is sitting pretty. Throw low and let them work.`,
    `When your partner is winning, your job is to stay out of it. Throw trash.`,
  ],
  PLAY_DUMP_CARD: [
    `Get rid of something you don't want to see later.`,
    `This is a chance to clean house. Throw your damn worst.`,
    `Use this trick to throw off dead weight. You'll thank yourself later.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // TRICK RESULTS
  // ─────────────────────────────────────────────────────────────────────────
  TRICK_WIN_TEAM: [
    `That's ours.`,
    `We take that.`,
    `Put that in the pile. That's a book.`,
    `Clean. That's how you damn do it.`,
    `Like it was already ours before the cards hit the table.`,
    `I KNEW that shit was coming. Good read.`,
    `That's discipline right there. Not luck — discipline.`,
    `One more in the bank. Keep it moving.`,
    `Sheeeeit. They didn't even see that coming.`,
  ],
  TRICK_WIN_TEAM_BIG: [
    `You took that like you BEEN doing this your whole life. Damn.`,
    `That was a grown-up play right there. I see you.`,
    `That's the kind of trick that changes a damn game. Remember how that felt.`,
    `THAT is what I'm talking about. You read that whole damn table.`,
    `Shit. THAT right there? That's what I've been waiting to see.`,
  ],
  TRICK_LOSS_TEAM: [
    `They got that one. We'll get the next.`,
    `Let 'em have it. Not every fight is our fight.`,
    `That trick was theirs from the jump. Don't sweat that shit.`,
    `We gave that one up. That's fine if it was on purpose.`,
  ],
  TRICK_LOSS_COSTLY: [
    `Damn. That one hurt. We needed that trick and it walked.`,
    `...that was one of ours. Think about what just happened there.`,
    `We just let a trick go that we were supposed to have. Tighten that shit up.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // SPADES BROKEN
  // ─────────────────────────────────────────────────────────────────────────
  SPADES_BROKEN: [
    `Spades are out. Everybody gotta tighten the hell up.`,
    `There it is. Spades are live. Shit just shifted.`,
    `Somebody broke spades. New rules now — anyone can lead trump.`,
    `Spades opened up. If you was hiding behind a side suit, that cover is gone. Damn.`,
    `Oh shit. Spades are in play. Adjust your thinking right now.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // NIL SITUATIONS
  // ─────────────────────────────────────────────────────────────────────────
  NIL_DANGER_HUMAN: [
    `You bid nil and they testing your ass. Stay low. Stay invisible.`,
    `This is the part where nil gets dangerous. Play the absolute bottom.`,
    `They coming for your nil. Don't panic — just play lower than low.`,
    `That nil is on the line right now. Whatever you do, don't take this damn trick.`,
  ],
  NIL_DANGER_PARTNER: [
    `Partner's nil is in trouble. We gotta damn cover.`,
    `Your partner needs you right now. Play high and pull that trick away from them.`,
    `This is where partnerships show. Cover that nil.`,
  ],
  NIL_FAILED_HUMAN: [
    `That nil is done. Shit happens. Shake it off — we still got a game to play.`,
    `Nil caught you. It's 100 points but it ain't the whole game. Refocus.`,
    `That one didn't go. But I've seen people come back from worse. We adjust.`,
    `...it happens. Even the best nil bidders catch one sometimes. Move forward.`,
  ],
  NIL_FAILED_PARTNER: [
    `Partner caught a trick on their nil. That's a hit, but we adjust.`,
    `Partner's nil broke. Damn. It's on us to make up the difference now.`,
  ],
  NIL_FAILED_OPPONENT: [
    `Their nil just broke. That's 100 coming off their score. Damn shame.`,
    `You love to see it. They tried nil and it didn't hold. Sheeeeit.`,
    `Their nil is done. That's a 200-point swing in our favor. We EATING.`,
  ],
  NIL_SUCCEEDED_HUMAN: [
    `That nil HELD. 100 points just like that. Shit, that took nerve.`,
    `You walked through 13 tricks and didn't take a single one. That's damn elite.`,
    `Nil successful. Sheeeeit. You played that with patience I didn't know your ass had.`,
  ],
  NIL_SUCCEEDED_PARTNER: [
    `Partner made their nil. That's 100 free points. We rolling.`,
    `Nil held. Your partner played that clean as hell.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // BAG WARNINGS
  // ─────────────────────────────────────────────────────────────────────────
  BAG_WARNING_CRITICAL: [
    `We at {bags} bags. One more overtrick and that's minus 100. Stop winning tricks we don't damn need.`,
    `{bags} bags. That penalty is RIGHT there. Every trick from here, ask yourself — do we NEED this?`,
    `This is not a drill. {bags} bags. One more and we lose 100 points. Play to LOSE tricks we don't need.`,
  ],
  BAG_WARNING_CAUTION: [
    `{bags} bags. That penalty is getting close.`,
    `Watch the bags. We at {bags}. Overtricks feel good until they cost you 100 damn points.`,
    `{bags} bags building up. Start thinking about which tricks to let go.`,
    `Those damn bags add up quiet. {bags} right now. Be intentional about what we take.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // OVERBID / UNDERBID RISK
  // ─────────────────────────────────────────────────────────────────────────
  OVERBID_RISK: [
    `We need {needed} more and there's only {left} left. Time to get damn serious.`,
    `{needed} tricks still on the board and {left} to play for. Every card matters now.`,
    `We're short. {needed} more tricks needed. This is where you find out what you're made of.`,
    `The bid is in danger. {needed} more with {left} left. No more throwaway plays. Shit.`,
  ],
  UNDERBID_WARNING: [
    `We already made our bid. Everything from here is bags. Play to lose.`,
    `Bid is made. Now the game is about NOT winning. Strange, right? But that's damn Spades.`,
    `We got our number. Now play low, play trash, dodge those bags.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // BIG SPADE PLAYED
  // ─────────────────────────────────────────────────────────────────────────
  BIG_SPADE_PLAYED: [
    `{card} of spades is gone. Remember that shit.`,
    `There goes the {card}. One less big spade to worry about.`,
    `{card} of spades just fell. {remaining} spades still out there. Track 'em.`,
    `That {card} is off the board. Adjusting what's possible from here.`,
    `The {card} just showed. If you was holding the next one down, your card just got damn promoted.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // VOID DETECTION
  // ─────────────────────────────────────────────────────────────────────────
  OPPONENT_VOID: [
    `They just showed a void in {suit}. They can't follow that suit anymore — they'll be cutting.`,
    `Watch that shit. They out of {suit}. Next time {suit} leads, expect a spade from them.`,
    `No more {suit} on that side. That's information you can use.`,
  ],
  PARTNER_VOID: [
    `Partner is out of {suit}. That means they cutting next damn time it comes around.`,
    `Your partner showed a void. That's not a problem — that's an opportunity.`,
    `Partner can't follow {suit}. If we lead it, they can trump. Think about that.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // ROUND END
  // ─────────────────────────────────────────────────────────────────────────
  ROUND_END_AHEAD: [
    `{ourScore} to {theirScore}. We in front. Keep that same energy.`,
    `Up {ourScore} to {theirScore}. Don't get comfortable — comfortable is how you lose a damn lead.`,
    `Ahead by {lead}. We built that shit. Now protect it.`,
    `{ourScore}-{theirScore}, our favor. That's not luck. That's how we played.`,
  ],
  ROUND_END_BEHIND: [
    `{ourScore} to {theirScore}. We down but this game ain't over.`,
    `Behind by {deficit}. Shit. I've seen bigger comebacks than this at the family reunion.`,
    `{ourScore}-{theirScore}. We trailing. Time to adjust, not panic.`,
    `Down right now. But every round is a new hand. Nothing is damn decided yet.`,
  ],
  ROUND_END_CLOSE: [
    `{ourScore} to {theirScore}. This is a damn game right here.`,
    `Neck and neck. This is where the real damn Spades players show up.`,
    `Close game. Every decision from here carries weight.`,
  ],
  ROUND_END_SET: [
    `We got set. Shit. That's a setback, not a sentence. Figure out where the bid went wrong.`,
    `Set. Damn. Hurts every time. But the question is — was the bid wrong or the play?`,
    `We missed the bid. No damn point being mad about it. Learn from it and deal again.`,
  ],
  ROUND_END_SET_OPPONENT: [
    `THEY got set. Sheeeeit. We just swung this game. Keep the pressure on.`,
    `Set their ass. That's what happens when your bid writes checks your hand can't cash.`,
    `Their bid fell short. That's momentum for us. Use that shit.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // GAME OVER
  // ─────────────────────────────────────────────────────────────────────────
  GAME_OVER_WIN: [
    `That's game. You BEEN ready for this — you just didn't know it yet.`,
    `Game. We put that damn work in. Every trick, every decision. That's the result.`,
    `That's a win. Not because you got lucky — because you paid attention. Shit, I'm proud of that.`,
    `We got it. And you earned every damn point. Run it back whenever you ready.`,
    `Game over. You played that like somebody who's been at this table before. Sheeeeit.`,
  ],
  GAME_OVER_LOSS: [
    `We lost this one. But you learned something every single round. Run that shit back.`,
    `That one got away from us. But you're better now than when we started. That ain't nothing.`,
    `Loss. Shit happens. The question is did you SEE what happened? That's the real win.`,
    `We'll get the next one. Every loss teaches you something a win never damn could.`,
    `Game didn't go our way. But I watched you get better trick by trick. Deal that shit again.`,
  ],
  GAME_OVER_BLOWOUT_WIN: [
    `We didn't just win. We made a damn STATEMENT. That's dominance right there.`,
    `That wasn't even close. Sheeeeit. You played that like it was personal.`,
    `They got their ass HANDED to 'em. I almost feel bad. Almost. Shit, no I don't.`,
  ],
  GAME_OVER_BLOWOUT_LOSS: [
    `...we got our ass handed to us. Real talk. But I'd rather get handled and learn than get handled and learn nothing.`,
    `That was rough. No damn way around it. But you stayed at the table. That says something.`,
    `Shit. That one hurt. But we coming back. Believe that.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // GENERAL WISDOM — Between-hand filler, teaching moments
  // ─────────────────────────────────────────────────────────────────────────
  WISDOM: [
    `Spades is a partnership game. You ain't out here solo. Everything you do affects your partner.`,
    `The best players at the table ain't the ones with the best cards. They the ones who read the damn table.`,
    `You know what separates good from great? Knowing when NOT to play your best card.`,
    `Counting cards ain't cheating. It's paying attention. There's 13 of every suit. Track 'em.`,
    `Every card somebody plays tells you something. The question is — are you listening?`,
    `Your partner is not your opponent. I've seen more games lost by partners fighting each other than by the other side.`,
    `Bags are the silent killer of Spades. Nobody ever thinks about bags until it's minus 100. Shit sneaks up on you.`,
    `A perfect bid is worth more than a lucky win. Bid what you know. Play what you bid.`,
    `When you don't know what to do, think about what your PARTNER needs. That usually clears it up.`,
    `The cards don't care about your feelings. They fall how they fall. Your job is to respond, not react.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // GOOD PLAY RECOGNITION — When the human makes a smart move
  // ─────────────────────────────────────────────────────────────────────────
  GOOD_PLAY: [
    `I see you. That was the right play.`,
    `Now THAT is how you do it. You read that perfectly.`,
    `That's the one. You didn't even hesitate. Damn good.`,
    `Smart. You're starting to see the table, not just your hand.`,
    `That play right there? That's growth. You wouldn't have done that three rounds ago.`,
    `You BEEN learning. I can see it in how you played that shit.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // BAD PLAY OBSERVATION — Quiet disappointment, never loud
  // ─────────────────────────────────────────────────────────────────────────
  BAD_PLAY: [
    `...think about why that didn't work.`,
    `That card had a job and that wasn't it.`,
    `You had a better option there. Did you see it?`,
    `I'm not gonna tell you what to play. But I want you to look at what just happened.`,
    `That's a card you're gonna wish you had later. Damn. Watch.`,
    `...we'll talk about that one between rounds.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // ENCOURAGEMENT — When the player is struggling
  // ─────────────────────────────────────────────────────────────────────────
  ENCOURAGEMENT: [
    `Rough stretch. That's part of it. Stay in the game.`,
    `Nobody walks into this game knowing everything. You learning in real time. That counts.`,
    `I didn't get good at this shit overnight either. Keep playing.`,
    `The table will turn. It always damn does. Be ready when it does.`,
    `You still here. You still playing. That's more than most people do when it gets hard.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // TRASH TALK — Light opponent commentary (intensity 2+)
  // ─────────────────────────────────────────────────────────────────────────
  TRASH_TALK_WINNING: [
    `They thought they had something over there. They damn sure didn't.`,
    `Lot of confidence on that side of the table for a team that's getting their ass handed to 'em.`,
    `They played that like they WANTED us to win. Shit, we'll take it.`,
    `I don't know what the hell their plan was, but it ain't working.`,
    `Their bid said one thing. Their play saying something else entirely. Pick a story.`,
    `Y'all wanna keep going or y'all wanna save yourselves the damn embarrassment?`,
    `I've seen people play bad before but this... sheeeeit. This is something else.`,
    `Somebody over there need to call for damn reinforcements.`,
    `That side of the table REAL quiet right now. I wonder the hell why.`,
    `You know what I love? When they KNOW they losing and they still gotta sit their ass there.`,
    `We ain't even playing hard. That's the damn sad part.`,
    `I would feel bad but shit, they did this to themselves.`,
    `They bidding like they got something. They do not GOT shit.`,
    `At this point we just running up the score for the hell of it.`,
  ],
  TRASH_TALK_AFTER_SET: [
    `Oh they got SET. Sit your ass down somewhere with that bid.`,
    `That bid was a damn WISH. And wishes don't win Spades.`,
    `You bid WHAT? And you got WHAT? Sheeeeit. The math ain't mathing over there.`,
    `Set. Again. At what damn point do you start bidding what you can actually make?`,
    `Their mouth wrote a check their ass couldn't cash. Again.`,
    `That's what happens when your confidence is bigger than your cards. Damn shame.`,
  ],
  TRASH_TALK_TOOK_TRICK: [
    `Thank you for that shit. We appreciate the donation.`,
    `They just GAVE us that trick. Shit, I ain't even mad, I'm grateful.`,
    `You see that? They handed that over like it was a damn present.`,
    `That trick right there? They didn't lose it. They DONATED it. Bless their hearts.`,
    `I would say good try but... was that a try? The hell was that?`,
  ],
  TRASH_TALK_BOSTON: [
    `A BOSTON. They didn't take a SINGLE trick. Not ONE. Go sit your ass in the car.`,
    `Thirteen to zero. Sheeeeit. I don't even know what to say. Actually I do — run it back.`,
    `That wasn't a game. That was a damn demonstration.`,
    `A whole round and they ain't take ONE trick. That ain't bad luck. That's a damn lifestyle.`,
    `Boston. Complete shutout. Somebody go check on their ass.`,
  ],
  TRASH_TALK_NIL_BUSTED: [
    `They bid nil and STILL caught a trick. You can't hide your ass at this table.`,
    `Nil? With THAT hand? That was bold. Bold and damn wrong.`,
    `We hunted that nil down. You thought you could sneak through? Not at THIS table.`,
    `That nil was doomed from the damn start. We just confirmed it.`,
  ],
  TRASH_TALK_COMEBACK: [
    `They was talking all that shit when they was ahead. Where's that energy NOW?`,
    `Funny how damn quiet it gets when the scoreboard flips.`,
    `Remember when they thought they had this? Sheeeeit. Good times.`,
    `We was down and they got comfortable. Comfortable will get your ass BEAT.`,
  ],
  TRASH_TALK_CLOSE_GAME: [
    `It's close but we got something they don't — composure. And that's the damn difference.`,
    `They sweating over there. I can tell. Shit, we calm though.`,
    `Tight game. But pressure busts pipes and we ain't the ones leaking. Believe that.`,
  ],
  TRASH_TALK_GENERAL: [
    `I've been playing Spades longer than these fools been alive. They don't want this shit.`,
    `Every table I sit at becomes a classroom. And class is in damn session.`,
    `They came to play. We came to WIN. There's a hell of a difference.`,
    `I ain't trying to be disrespectful... but shit, they making it easy.`,
    `This the kind of game where afterwards they gonna say 'the cards were bad.' The cards were fine.`,
    `If Spades was easy, everybody would be good at it. Clearly... everybody is not good at this shit.`,
    `I'm not gonna say they can't play. I'm gonna say the scoreboard speaks for its damn self.`,
    `They playing checkers at a Spades table. Sheeeeit. You can see it in every trick.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // TRASH TALK — HYPE / IN-THE-MOMENT (JB Smoove energy)
  // Full cookout, at the table, talking to cards and opponents
  // ─────────────────────────────────────────────────────────────────────────
  HYPE_TOOK_TRICK: [
    `BRING that to me. Bring that RIGHT here. That's OURS.`,
    `Run that shit back. Run that shit back. RUN THAT SHIT BACK.`,
    `Come on out. Come ON out. I KNEW your ass was in there. Get over here.`,
    `You see that? You SEE that? They ain't got SHIT for us right now.`,
    `THAT'S what I'm talking about! Put that in the pile. PUT it in the pile!`,
    `Oh you thought you had something? You THOUGHT? Nah. Hell nah.`,
    `Give me that. GIVE me that. Thank you very damn much. NEXT.`,
    `One thing about it, two things for certain — that trick is OURS.`,
    `They can keep throwing. We gonna keep CATCHING. All damn day.`,
    `WHERE is the competition? I was told there would be competition at this damn table!`,
    `Sheeeeit. That wasn't even close. NEXT trick please.`,
  ],
  HYPE_BIG_PLAY: [
    `OH! You just DID that! Shit! Did everybody see what just happened?!`,
    `LOOK at this! We out here COOKING right now. Somebody call the damn fire department!`,
    `That was DISRESPECTFUL and I am HERE for it. Play that shit AGAIN.`,
    `You ain't got NOTHING! Not a damn THING! Bring whatever you got, it ain't enough!`,
    `Come on, come ON! They can't TOUCH us right now! Not RIGHT now!`,
    `What you gonna do NOW? Huh? WHAT you gonna do? That's what I damn thought.`,
    `We ain't just winning, we making a damn STATEMENT. Put that on the record.`,
    `Sheeeeit. I'm trying to be humble but y'all making it IMPOSSIBLE!`,
    `Oh SHIT. That play right there? That's going in the hall of fame.`,
  ],
  HYPE_SPADE_CUT: [
    `Oh you leading that? You LEADING that? Bring your ass on out with that spade.`,
    `CUT that shit. Cut it RIGHT now. They thought they was safe. They was NOT safe.`,
    `Bring that trump to me. BRING it. That little heart ain't gonna save your ass over here.`,
    `You can lead whatever the hell you want. We got SPADES for ALL of that.`,
    `They threw that out there all confident. Then the spade showed up. Sheeeeit. Confidence GONE.`,
  ],
  HYPE_WINNING_STREAK: [
    `We ain't slowing down! Not NOW! Keep that shit GOING!`,
    `How many is that? Shit, I lost COUNT. Keep 'em coming!`,
    `They need to regroup over there because this shit is NOT going how they planned!`,
    `Back to back to BACK. Somebody stop us. Oh wait — they CAN'T. Damn shame.`,
    `We on a RUN right now. Everything coming to THIS side of the table!`,
    `Sheeeeit. At this point I'm just seeing how many we can take in a ROW.`,
  ],
  HYPE_OPPONENT_BAD_PLAY: [
    `What the hell WAS that?! Did you MEAN to play that?`,
    `Oh no no no. They just... shit. They just DID that. On PURPOSE. At THIS table.`,
    `You see what they just threw out there? I damn near fell out my chair.`,
    `That card right there? That card just snitched on their WHOLE hand.`,
    `They panicking over there. You can SEE it. They don't know what the hell to do.`,
    `I KNOW your ass didn't just play that. I KNOW you didn't. But you DID.`,
    `Damn. That was the wrong card and they KNOW it was the wrong card.`,
  ],
  HYPE_DEFENSE: [
    `Nah. NAH. You not bringing that shit through here. Not TODAY.`,
    `You thought you was gonna sneak that by? At THIS table? With ME sitting here? Sheeeeit.`,
    `Block THAT. We ain't letting shit through. Try again.`,
    `You gonna have to come harder than THAT. Way damn harder.`,
    `That's a whole lotta effort for a trick your ass ain't getting. Nice try though.`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // TRASH TALK — OPPONENT SET
  // ─────────────────────────────────────────────────────────────────────────
  TRASH_TALK_OPPONENT_SET: [
    `Oh they got SET. Sit your ass down somewhere with that bid.`,
    `That bid was a damn WISH. And wishes don't win Spades.`,
    `Set. Again. At what point do you start bidding what you can actually make?`,
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // TRASH TALK — WE DOMINATING
  // ─────────────────────────────────────────────────────────────────────────
  TRASH_TALK_WE_DOMINATING: [
    `We ain't just winning, we making a damn STATEMENT.`,
    `They came to play. We came to WIN. There's a hell of a difference.`,
    `That side of the table REAL quiet right now. I wonder the hell why.`,
  ],
};
// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════
/**
 * Get a single random line from a category.
 *
 * Supports template variables in curly braces:
 *   getLine('BAG_WARNING_CRITICAL', { bags: 9 })
 *   → "We at 9 bags. One more overtrick and that's minus 100..."
 *
 * @param {string} category — key from LINES object
 * @param {Object} [vars]   — template variables to interpolate
 * @returns {string|null}   — the line, or null if category doesn't exist
 */
export function getLine(category, vars = {}) {
  const pool = LINES[category];
  if (!pool || pool.length === 0) return null;
  let line = pick(pool);
  for (const [key, value] of Object.entries(vars)) {
    line = line.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return line;
}
/**
 * Get the full array of lines for a category.
 *
 * @param {string} category — key from LINES object
 * @returns {string[]}      — all lines, or empty array
 */
export function getLines(category) {
  return LINES[category] || [];
}
/**
 * Get all category names.
 *
 * @returns {string[]}
 */
export function getCategories() {
  return Object.keys(LINES);
}
/**
 * Get total line count across all categories.
 *
 * @returns {number}
 */
export function getTotalLineCount() {
  return Object.values(LINES).reduce((sum, arr) => sum + arr.length, 0);
}