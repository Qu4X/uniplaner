import sys
from sources.umg.wn import arktur_client, arktur_html, arktur_parser, nst_client, nst_parser, arktur_nst

sys.modules['sources.umg_wn.arktur_client'] = arktur_client
sys.modules['sources.umg_wn.arktur_html'] = arktur_html
sys.modules['sources.umg_wn.arktur_parser'] = arktur_parser
sys.modules['sources.umg_wn.nst_client'] = nst_client
sys.modules['sources.umg_wn.nst_parser'] = nst_parser
sys.modules['sources.umg_wn.arktur_nst'] = arktur_nst
