import asyncio
import os
from app.services.multi_format_pipeline import run_multi_format_pipeline

async def test_pipeline():
    sample_text = """
    Weekly Weather Forecast
    Today: Sunny, Temp: 66F High, 43F Low
    THU: Sunny, Temp: 69F High, 39F Low
    FRI: More sun than clouds, Temp: 72F High, 44F Low
    SAT: Passing clouds, Temp: 78F High, 47F Low
    SUN: More sun than clouds, Temp: 78F High, 53F Low
    MON: Scattered clouds, Temp: 77F High, 52F Low
    TUE: Scattered clouds, Temp: 75F High, 55F Low
    """
    
    print("Running multi-format pipeline test...")
    res = await run_multi_format_pipeline(
        filename="test_weather_image.txt",
        content=sample_text.encode("utf-8"),
        content_type="text/plain",
        user_id="test_user"
    )
    
    print("\nExtraction Success!")
    print(f"Report Type: {res.metadata.get('report_type')}")
    print(f"Confidence: {res.metadata.get('confidence')}")
    print(f"AI Summary: {res.metadata.get('ai_summary')}")
    print(f"Extracted Data: {res.metadata.get('extracted_data')}")
    
    # Check if raw text file exists
    txt_path = os.path.join("data", "raw_uploads", "test_weather_image.txt")
    if os.path.exists(txt_path):
        print(f"Success: Raw text notepad file created at {txt_path}")
    else:
        print(f"Error: Raw text notepad file not found at {txt_path}")

if __name__ == "__main__":
    asyncio.run(test_pipeline())
