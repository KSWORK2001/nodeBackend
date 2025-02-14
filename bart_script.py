from transformers import BartForConditionalGeneration, BartTokenizer
import sys
import json

# BART
model_name = "facebook/bart-large-cnn"
tokenizer = BartTokenizer.from_pretrained(model_name)
model = BartForConditionalGeneration.from_pretrained(model_name)
input_text = sys.stdin.read()

# Summarizing the input text
inputs = tokenizer(input_text, max_length=1024, return_tensors="pt", truncation=True)
summary_ids = model.generate(inputs["input_ids"], max_length=130, min_length=30, length_penalty=2.0, num_beams=4)
summary = tokenizer.decode(summary_ids[0], skip_special_tokens=True)

print(json.dumps({"summary": summary}))