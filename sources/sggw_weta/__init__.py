import sys
from sources.sggw.weta import adapter, client, parser

sys.modules['sources.sggw_weta.adapter'] = adapter
sys.modules['sources.sggw_weta.client'] = client
sys.modules['sources.sggw_weta.parser'] = parser
